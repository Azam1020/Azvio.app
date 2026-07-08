import os
import random
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


async def new_portal_token() -> str:
    """رقم قصير فريد لرابط بوابة العميل (طلب: رابط بالأرقام) — 8 أرقام، أسهل للنطق والكتابة
    من رمز hex عشوائي. يتأكد ما فيه تكرار قبل ما يرجّعه."""
    for _ in range(20):
        token = str(random.randint(10_000_000, 99_999_999))
        exists = await db.clients.find_one({"portal_token": token}, {"_id": 1})
        if not exists:
            return token
    # احتياط نظري بعيد جداً لو صار تعارض 20 مرة متتالية
    return str(random.randint(100_000_000, 999_999_999))
