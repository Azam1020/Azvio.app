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
