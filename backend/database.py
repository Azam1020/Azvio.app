import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

# السعودية UTC+3 بدون توقيت صيفي، فما نحتاج مكتبة zoneinfo كاملة لهذا الفارق الثابت
RIYADH_OFFSET = timedelta(hours=3)


def today_str() -> str:
    """تاريخ اليوم بتوقيت الرياض — نفس التوقيت اللي يستخدمه Google Calendar (Asia/Riyadh).
    استخدام UTC الخام هنا كان يسبب فرق يوم كامل بين الساعة 9م ومنتصف الليل توقيت الرياض."""
    return (datetime.now(timezone.utc) + RIYADH_OFFSET).strftime("%Y-%m-%d")
