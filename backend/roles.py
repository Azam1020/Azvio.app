"""Central team-role definitions.

Roles are granular now (not just admin/member). 'admin' keeps full access;
the specialised roles are used for task routing and the personalised
"Today" screen. Any role that isn't 'admin' is treated as a regular member
for permission gating.
"""

# key -> Arabic label
ROLES = {
    "admin": "مدير",
    "photographer": "مصوّر",
    "editor": "مونتير",
    "project_manager": "مدير مشروع",
}

VALID_ROLES = set(ROLES.keys())

# Legacy value still accepted on read; mapped to a generic member.
LEGACY_ROLES = {"member"}


def is_valid_role(role: str) -> bool:
    return role in VALID_ROLES or role in LEGACY_ROLES


def role_label(role: str) -> str:
    if role in ROLES:
        return ROLES[role]
    return "عضو فريق"


# ============ صلاحيات الأقسام (طلب #17) ============
# كل قسم بالتطبيق له معرّف واحد، وكل دور يملك قائمة الأقسام المسموح له يشوفها.
# admin دائماً كل شي، بدون ذكره صراحة بكل قسم.

ALL_SECTIONS = {
    "content", "calendar", "services", "pricing", "invoices", "portfolio",
    "whatsapp", "insights", "google_accounts", "links", "settings",
    "team", "tickets", "finance", "clients",
}

# الأدوار غير الإدارية — كل وحدة تشوف بس الأقسام المذكورة لها.
# ما فيه مالية، تسعيرتي، فواتير، أو إدارة فريق لغير admin/project_manager
# لأنها بيانات حساسة تجارياً (أسعار، أرباح، عقود).
SECTION_PERMISSIONS = {
    "project_manager": {
        "content", "calendar", "services", "pricing", "invoices", "portfolio",
        "whatsapp", "insights", "google_accounts", "links", "settings",
        "tickets", "finance", "clients",
        # ماعدا "team" — إدارة المستخدمين تبقى لصاحب التطبيق فقط
    },
    "editor": {
        "content", "calendar", "portfolio", "links", "settings", "clients",
        # ماعدا: المالية، تسعيرتي، الفواتير، واتساب (بيانات تجارية حساسة)،
        # حسابات قوقل، إدارة الفريق، ملاحظات سند
    },
    "photographer": {
        "content", "calendar", "portfolio", "links", "settings", "clients",
    },
}


def allowed_sections(role: str) -> set:
    """الأقسام المسموح لهذا الدور يشوفها. admin دايماً كل شي."""
    if role == "admin":
        return set(ALL_SECTIONS) | {"team"}
    return SECTION_PERMISSIONS.get(role, SECTION_PERMISSIONS["photographer"])


def can_access_section(role: str, section: str) -> bool:
    return section in allowed_sections(role)
