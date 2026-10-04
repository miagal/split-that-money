"""Shared fingerprint upsert helper for sync-owned money rows."""

from django.db import IntegrityError, transaction


def upsert_with_fingerprint(model, lookup_id, frozen_fields, mutable_values):
    """Insert or update one UUID-owned row after validating its frozen fingerprint."""
    try:
        instance = model.objects.get(id=lookup_id)
    except model.DoesNotExist:
        try:
            with transaction.atomic():
                return model.objects.create(id=lookup_id, **frozen_fields, **mutable_values), "created"
        except IntegrityError:
            instance = model.objects.get(id=lookup_id)

    for field_name, value in frozen_fields.items():
        if getattr(instance, field_name) != value:
            return instance, "conflict"

    if mutable_values["updated_at"] <= instance.updated_at:
        return instance, "ignored"

    for field_name, value in mutable_values.items():
        setattr(instance, field_name, value)
    instance.save(update_fields=list(mutable_values))
    return instance, "updated"
