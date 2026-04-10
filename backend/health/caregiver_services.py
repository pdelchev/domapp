"""
Caregiver delegation services.

§PURPOSE: Manage caregiver access to health profiles.
          Invite workflow, permission validation, accept/revoke.

§FLOW:
  1. Primary user invites caregiver by email
  2. Create CaregiverRelationship with status='pending'
  3. Caregiver receives notification (TODO: email)
  4. Caregiver accepts via API
  5. Caregiver can now view/edit profile per permissions
  6. Primary or caregiver can revoke at any time
"""

from django.utils import timezone as _tz
from django.core.exceptions import PermissionDenied

from .daily_models import CaregiverRelationship
from .models import HealthProfile


def create_caregiver_invite(
    primary_user,
    profile: HealthProfile,
    caregiver_user,
    permissions: list = None,
    relationship_note: str = '',
) -> CaregiverRelationship:
    """
    Invite a user to be a caregiver for a profile.
    Returns: created or updated CaregiverRelationship (status='pending').

    §VALIDATION: Profile must belong to primary_user.
    """
    if profile.user_id != primary_user.id:
        raise PermissionDenied('Profile not owned by user.')

    if permissions is None:
        permissions = ['view_all']

    rel, created = CaregiverRelationship.objects.update_or_create(
        user=primary_user,
        profile=profile,
        caregiver_user=caregiver_user,
        defaults={
            'status': 'pending',
            'permissions': permissions,
            'relationship_note': relationship_note,
            'accepted_at': None,
            'revoked_at': None,
        }
    )
    return rel


def accept_caregiver_invite(caregiver_user, relationship_id: int) -> CaregiverRelationship:
    """
    Caregiver accepts an invite.
    Returns: updated CaregiverRelationship (status='accepted', accepted_at=now).

    §VALIDATION: Caregiver must own the relationship.
    """
    rel = CaregiverRelationship.objects.get(id=relationship_id)
    if rel.caregiver_user_id != caregiver_user.id:
        raise PermissionDenied('Not your invite.')

    if rel.status != 'pending':
        raise ValueError(f'Invite already {rel.get_status_display().lower()}.')

    rel.status = 'accepted'
    rel.accepted_at = _tz.now()
    rel.save()
    return rel


def decline_caregiver_invite(caregiver_user, relationship_id: int) -> None:
    """
    Caregiver declines an invite (deletes the relationship).
    """
    rel = CaregiverRelationship.objects.get(id=relationship_id)
    if rel.caregiver_user_id != caregiver_user.id:
        raise PermissionDenied('Not your invite.')

    if rel.status != 'pending':
        raise ValueError(f'Cannot decline {rel.get_status_display().lower()} invite.')

    rel.delete()


def revoke_caregiver_access(user, relationship_id: int) -> CaregiverRelationship:
    """
    Primary user or caregiver revokes access.
    Returns: updated CaregiverRelationship (status='revoked', revoked_at=now).
    """
    rel = CaregiverRelationship.objects.get(id=relationship_id)

    if rel.user_id != user.id and rel.caregiver_user_id != user.id:
        raise PermissionDenied('Not your relationship.')

    rel.status = 'revoked'
    rel.revoked_at = _tz.now()
    rel.save()
    return rel


def get_caregiver_profiles(caregiver_user) -> list:
    """
    Get all health profiles this user has caregiver access to.
    Returns: list of HealthProfile IDs accessible by this caregiver.
    """
    rel_list = CaregiverRelationship.objects.filter(
        caregiver_user=caregiver_user,
        status='accepted'
    ).exclude(revoked_at__isnull=False)

    return [rel.profile for rel in rel_list]


def can_view_profile(user, profile: HealthProfile) -> bool:
    """
    Check if user can view a profile.
    Returns: True if user owns it OR has active caregiver access.
    """
    # Own profile
    if profile.user_id == user.id:
        return True

    # Caregiver access
    rel = CaregiverRelationship.objects.filter(
        caregiver_user=user,
        profile=profile,
        status='accepted'
    ).exclude(revoked_at__isnull=False).first()

    return bool(rel)


def can_edit_profile(user, profile: HealthProfile) -> bool:
    """
    Check if user can edit/update a profile.
    Returns: True if user owns it (caregivers read-only by default).
    """
    return profile.user_id == user.id


def can_log_dose(user, profile: HealthProfile) -> bool:
    """
    Check if user can log a supplement dose for this profile.
    """
    # Own profile
    if profile.user_id == user.id:
        return True

    # Caregiver with explicit permission
    rel = CaregiverRelationship.objects.filter(
        caregiver_user=user,
        profile=profile,
        status='accepted'
    ).exclude(revoked_at__isnull=False).first()

    return bool(rel and rel.has_permission('log_doses'))


def can_edit_schedule(user, profile: HealthProfile) -> bool:
    """
    Check if user can create/edit supplement schedules for this profile.
    """
    # Own profile
    if profile.user_id == user.id:
        return True

    # Caregiver with explicit permission
    rel = CaregiverRelationship.objects.filter(
        caregiver_user=user,
        profile=profile,
        status='accepted'
    ).exclude(revoked_at__isnull=False).first()

    return bool(rel and rel.has_permission('edit_schedules'))


def can_edit_supplements(user, profile: HealthProfile) -> bool:
    """
    Check if user can add/edit supplements for this profile.
    """
    # Own profile
    if profile.user_id == user.id:
        return True

    # Caregiver with explicit permission
    rel = CaregiverRelationship.objects.filter(
        caregiver_user=user,
        profile=profile,
        status='accepted'
    ).exclude(revoked_at__isnull=False).first()

    return bool(rel and rel.has_permission('edit_supplements'))
