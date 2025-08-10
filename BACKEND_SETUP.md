# راهنمای کامل راه‌اندازی بک‌اند چت‌بات

## ساختار پروژه بک‌اند

```
backend/
├── app.py                 # فایل اصلی Flask
├── requirements.txt       # وابستگی‌های پایتون
├── render.yaml           # تنظیمات Render.com
├── temp_data/            # پوشه داده‌های موقت (خودکار ساخته می‌شود)
├── templates/
│   └── index.html        # فایل HTML (اختیاری)
└── static/              # فایل‌های استاتیک (اختیاری)
```

## فایل app.py

```python
import os
import re
import requests
import json
from flask import Flask, render_template, request, Response, jsonify
from flask_cors import CORS
import logging
from filelock import FileLock
from pathlib import Path
import base64
import time

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
    # چرخش کلیدهای API
    ALL_GEMINI_API_KEYS_STR = os.getenv('ALL_GEMINI_API_KEYS')
    if not ALL_GEMINI_API_KEYS_STR:
        raise RuntimeError("متغیر ALL_GEMINI_API_KEYS تنظیم نشده است.")
    MASTER_API_KEYS = [key.strip() for key in ALL_GEMINI_API_KEYS_STR.split(',') if key.strip()]
    if not MASTER_API_KEYS:
        raise RuntimeError("هیچ کلید معتبری در ALL_GEMINI_API_KEYS یافت نشد.")

    # تنظیم پوشه‌های داده
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
    
    META_DIR = TEMP_DATA_DIR / 'chat_meta'
    META_DIR.mkdir(parents=True, exist_ok=True)

except Exception as e:
    logging.critical(f"خطای بحرانی در هنگام بارگذاری کلیدهای API: {e}")
    raise

app = Flask(__name__)
CORS(app)  # برای اتصال از frontend
GOOGLE_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

def get_and_increment_key_index():
    """دریافت و افزایش ایندکس کلید برای چرخش کلیدها"""
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
    """دریافت کلیدهای مرتب شده برای درخواست"""
    start_index = get_and_increment_key_index()
    ordered_keys = []
    
    for i in range(len(MASTER_API_KEYS)):
        key_index = (start_index + i) % len(MASTER_API_KEYS)
        ordered_keys.append(MASTER_API_KEYS[key_index])
    
    return ordered_keys

def make_gemini_request(prompt, file_data=None, stream=True):
    """ارسال درخواست به Gemini API با امکان استریم"""
    ordered_keys = get_keys_for_request()
    
    for api_key in ordered_keys:
        try:
            url = f"{GOOGLE_API_BASE_URL}/gemini-1.5-flash:streamGenerateContent?key={api_key}"
            
            parts = [{"text": prompt}]
            if file_data:
                parts.append({
                    "inline_data": {
                        "mime_type": file_data["mime_type"],
                        "data": file_data["data"]
                    }
                })
            
            payload = {
                "contents": [{"parts": parts}],
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 4096,
                }
            }
            
            headers = {"Content-Type": "application/json"}
            
            if stream:
                response = requests.post(url, json=payload, headers=headers, stream=True)
            else:
                response = requests.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                return response
            else:
                logging.warning(f"API key failed: {response.status_code}")
                continue
                
        except Exception as e:
            logging.error(f"خطا در درخواست با کلید {api_key[:10]}...: {e}")
            continue
    
    raise Exception("تمام کلیدهای API شکست خوردند")

@app.route('/')
def index():
    """صفحه اصلی (اختیاری)"""
    return jsonify({"message": "چت‌بات API آماده است"})

@app.route('/api/chat', methods=['POST'])
def chat():
    """endpoint اصلی چت با پشتیبانی از استریم"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        file_data = data.get('file_data')  # {"mime_type": "...", "data": "base64..."}
        
        if not message.strip() and not file_data:
            return jsonify({"error": "پیام یا فایل ضروری است"}), 400
        
        def generate_response():
            try:
                response = make_gemini_request(message, file_data, stream=True)
                
                for line in response.iter_lines():
                    if line:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            try:
                                json_data = json.loads(line_text[6:])
                                if 'candidates' in json_data and json_data['candidates']:
                                    content = json_data['candidates'][0]['content']
                                    if 'parts' in content and content['parts']:
                                        text = content['parts'][0].get('text', '')
                                        if text:
                                            yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\\n\\n"
                            except json.JSONDecodeError:
                                continue
                
                yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\\n\\n"
                
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\\n\\n"
        
        return Response(
            generate_response(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        )
        
    except Exception as e:
        logging.error(f"خطا در chat endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """آپلود و پردازش فایل"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "فایلی ارسال نشده"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "فایل انتخاب نشده"}), 400
        
        # خواندن و کدگذاری فایل
        file_content = file.read()
        file_b64 = base64.b64encode(file_content).decode('utf-8')
        
        return jsonify({
            "success": True,
            "file_data": {
                "mime_type": file.content_type,
                "data": file_b64,
                "filename": file.filename
            }
        })
        
    except Exception as e:
        logging.error(f"خطا در آپلود فایل: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
```

## فایل requirements.txt

```
Flask==2.3.3
Flask-CORS==4.0.0
Werkzeug==2.3.7
gunicorn==21.2.0
requests==2.31.0
gevent==23.7.0
filelock==3.13.1
```

## فایل render.yaml (اختیاری)

```yaml
services:
  - type: web
    name: chatbot-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn --workers 3 --worker-class gevent --bind 0.0.0.0:$PORT --timeout 600 app:app
    envVars:
      - key: ALL_GEMINI_API_KEYS
        sync: false
```

## دستورالعمل استقرار در Render.com

### مرحله ۱: آماده‌سازی پروژه

1. فایل‌های بالا را در یک پوشه جدید قرار دهید
2. پروژه را در گیت‌هاب آپلود کنید

### مرحله ۲: ایجاد سرویس در Render

1. وارد [Render.com](https://render.com) شوید
2. "New" → "Web Service" را کلیک کنید
3. ریپازیتوری گیت‌هاب خود را انتخاب کنید

### مرحله ۳: تنظیمات ساخت

```
Name: chatbot-api
Environment: Python
Build Command: pip install -r requirements.txt
Start Command: gunicorn --workers 3 --worker-class gevent --bind 0.0.0.0:$PORT --timeout 600 app:app
```

### مرحله ۴: متغیرهای محیطی

در بخش "Environment Variables":

```
Key: ALL_GEMINI_API_KEYS
Value: your_key1,your_key2,your_key3
```

## اتصال Frontend به Backend

در فایل‌های React خود، API_BASE_URL را تغییر دهید:

```typescript
// در محیط توسعه
const API_BASE_URL = 'http://localhost:5000';

// در محیط تولید
const API_BASE_URL = 'https://your-app-name.onrender.com';
```

## تست محلی

```bash
# نصب وابستگی‌ها
pip install -r requirements.txt

# اجرای برنامه
export ALL_GEMINI_API_KEYS="your_key1,your_key2"
python app.py
```

## نکات مهم

1. حتماً کلیدهای API معتبر Gemini داشته باشید
2. برای تست، حداقل یک کلید کافی است
3. فایل temp_data/ خودکار ساخته می‌شود
4. CORS برای اتصال از دامنه‌های مختلف فعال است
5. استریم پاسخ‌ها پشتیبانی می‌شود