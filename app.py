import os
import re
import requests
import json
from flask import Flask, render_template, request, Response
from flask_cors import CORS
import logging
from filelock import FileLock
from pathlib import Path
import base64

class PersianLogFormatter(logging.Formatter):
    LEVEL_MAP = {
        logging.DEBUG: "دیباگ",
        logging.INFO: "اطلاع",
        logging.WARNING: "هشدار",
        logging.ERROR: "خطا",
        logging.CRITICAL: "بحرانی",
    }
    def format(self, record):
        record.levelname = self.LEVEL_MAP.get(record.levelno, record.levelname)
        return super().format(record)

def setup_logging():
    log_format = '[%(asctime)s] [%(levelname)s]: %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    formatter = PersianLogFormatter(log_format, datefmt=date_format)
    root_logger = logging.getLogger()
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    root_logger.setLevel(logging.INFO)

setup_logging()

try:
    ALL_GEMINI_API_KEYS_STR = os.getenv('ALL_GEMINI_API_KEYS')
    if not ALL_GEMINI_API_KEYS_STR:
        raise RuntimeError("متغیر ALL_GEMINI_API_KEYS تنظیم نشده است.")
    MASTER_API_KEYS = [key.strip() for key in ALL_GEMINI_API_KEYS_STR.split(',') if key.strip()]
    if not MASTER_API_KEYS:
        raise RuntimeError("هیچ کلید معتبری در ALL_GEMINI_API_KEYS یافت نشد.")

    # برای Render.com، از یک پوشه محلی استفاده می‌کنیم
    TEMP_DATA_DIR = Path('temp_data')
    TEMP_DATA_DIR.mkdir(parents=True, exist_ok=True)

    COUNTER_FILE_PATH = TEMP_DATA_DIR / 'gunicorn_key_counter.txt'
    lock_path = str(COUNTER_FILE_PATH) + ".lock"
    lock = FileLock(lock_path)
    with lock:
        if not os.path.exists(COUNTER_FILE_PATH):
            logging.info(f"✅ اولین کارگر شروع به کار کرد. با موفقیت {len(MASTER_API_KEYS)} کلید Gemini بارگذاری شد.")
            with open(COUNTER_FILE_PATH, 'w') as f:
                f.write('0')
            logging.info("شمارنده چرخش کلیدها مقداردهی اولیه شد.")

    CACHE_DIR = TEMP_DATA_DIR / 'file_cache'
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    logging.info(f"پوشه کش فایل‌ها در مسیر '{CACHE_DIR}' آماده استفاده است.")

    META_DIR = TEMP_DATA_DIR / 'chat_meta'
    META_DIR.mkdir(parents=True, exist_ok=True)
    logging.info(f"پوشه متادیتای چت‌ها در مسیر '{META_DIR}' آماده استفاده است.")

except Exception as e:
    logging.critical(f"خطای بحرانی در هنگام بارگذاری کلیدهای API یا تنظیم کش/متا: {e}")
    raise

app = Flask(__name__)
CORS(app)
GOOGLE_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

def get_and_increment_key_index():
    """چرخش کلیدهای API برای توزیع بار"""
    lock_path = str(COUNTER_FILE_PATH) + ".lock"
    lock = FileLock(lock_path)
    
    with lock:
        try:
            with open(COUNTER_FILE_PATH, 'r') as f:
                current_index = int(f.read().strip())
        except (FileNotFoundError, ValueError):
            current_index = 0
        
        next_index = (current_index + 1) % len(MASTER_API_KEYS)
        
        with open(COUNTER_FILE_PATH, 'w') as f:
            f.write(str(next_index))
        
        return current_index

def get_keys_for_request():
    """انتخاب کلید API برای درخواست جاری"""
    chosen_index = get_and_increment_key_index()
    primary_key = MASTER_API_KEYS[chosen_index]
    
    backup_keys = [key for i, key in enumerate(MASTER_API_KEYS) if i != chosen_index]
    
    logging.info(f"🔑 کلید شماره {chosen_index + 1} از {len(MASTER_API_KEYS)} کلید انتخاب شد.")
    return primary_key, backup_keys

def make_gemini_request(model_name, request_data, stream=True):
    """ارسال درخواست به Gemini API با قابلیت استریم"""
    primary_key, backup_keys = get_keys_for_request()
    all_keys = [primary_key] + backup_keys
    
    for attempt, api_key in enumerate(all_keys, 1):
        try:
            masked_key = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "***"
            logging.info(f"🚀 تلاش {attempt} با کلید {masked_key}")
            
            url = f"{GOOGLE_API_BASE_URL}/{model_name}:streamGenerateContent"
            if not stream:
                url = f"{GOOGLE_API_BASE_URL}/{model_name}:generateContent"
            
            headers = {
                'Content-Type': 'application/json',
                'x-goog-api-key': api_key
            }
            
            response = requests.post(url, headers=headers, json=request_data, stream=stream, timeout=120)
            
            if response.status_code == 200:
                logging.info(f"✅ درخواست با کلید {masked_key} موفقیت‌آمیز بود.")
                return response
            else:
                logging.warning(f"⚠️ کلید {masked_key}: کد خطا {response.status_code}")
                if response.status_code == 429:
                    logging.warning("محدودیت نرخ رسیده. تلاش با کلید بعدی...")
                elif response.status_code == 403:
                    logging.warning("کلید نامعتبر یا دسترسی مجاز نیست.")
                
        except requests.exceptions.Timeout:
            logging.error(f"⏰ تایم‌اوت برای کلید {masked_key}")
        except requests.exceptions.RequestException as e:
            logging.error(f"🔌 خطای شبکه با کلید {masked_key}: {e}")
        except Exception as e:
            logging.error(f"💥 خطای غیرمنتظره با کلید {masked_key}: {e}")
    
    logging.error("❌ تمام کلیدهای API ناموفق بودند.")
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """پردازش درخواست چت و ارسال پاسخ استریم"""
    try:
        data = request.get_json()
        if not data:
            return Response("درخواست نامعتبر", status=400)
        
        message = data.get('message', '').strip()
        model = data.get('model', 'gemini-1.5-flash')
        files = data.get('files', [])
        
        if not message and not files:
            return Response("پیام یا فایل ضروری است", status=400)
        
        # تبدیل نام مدل
        model_mapping = {
            'gemini-2.5-flash': 'gemini-1.5-flash',
            'gemini-2.5-pro': 'gemini-1.5-pro'
        }
        actual_model = model_mapping.get(model, model)
        
        # ساخت محتوای درخواست
        contents = []
        
        if message:
            contents.append({"text": message})
        
        # پردازش فایل‌ها
        for file_data in files:
            if file_data.get('type', '').startswith('image/'):
                contents.append({
                    "inline_data": {
                        "mime_type": file_data['type'],
                        "data": file_data['data']
                    }
                })
        
        request_data = {
            "contents": [{"parts": contents}],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 8192
            }
        }
        
        def generate():
            response = make_gemini_request(actual_model, request_data, stream=True)
            
            if not response:
                yield f"data: {json.dumps({'error': 'خطا در اتصال به سرویس AI'})}\n\n"
                return
            
            try:
                for line in response.iter_lines():
                    if line:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            json_str = line_text[6:]
                            try:
                                chunk_data = json.loads(json_str)
                                if 'candidates' in chunk_data:
                                    candidate = chunk_data['candidates'][0]
                                    if 'content' in candidate and 'parts' in candidate['content']:
                                        for part in candidate['content']['parts']:
                                            if 'text' in part:
                                                yield f"data: {json.dumps({'text': part['text']})}\n\n"
                            except json.JSONDecodeError:
                                continue
                
                yield "data: [DONE]\n\n"
                
            except Exception as e:
                logging.error(f"خطا در پردازش استریم: {e}")
                yield f"data: {json.dumps({'error': 'خطا در پردازش پاسخ'})}\n\n"
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        )
        
    except Exception as e:
        logging.error(f"خطا در endpoint چت: {e}")
        return Response(f"خطای سرور: {str(e)}", status=500)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """آپلود فایل و تبدیل به base64"""
    try:
        if 'file' not in request.files:
            return {"error": "فایل یافت نشد"}, 400
        
        file = request.files['file']
        if file.filename == '':
            return {"error": "فایل انتخاب نشده"}, 400
        
        # خواندن محتوای فایل
        file_content = file.read()
        file_base64 = base64.b64encode(file_content).decode('utf-8')
        
        return {
            "success": True,
            "filename": file.filename,
            "size": len(file_content),
            "type": file.content_type or "application/octet-stream",
            "data": file_base64
        }
        
    except Exception as e:
        logging.error(f"خطا در آپلود فایل: {e}")
        return {"error": f"خطا در آپلود: {str(e)}"}, 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)