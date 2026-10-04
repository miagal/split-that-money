"""Pure helpers for expense split math."""

from uuid import UUID

from app.core.errors import DomainError


def compute_split(amount_cents: int, split_type: str, participant_values: dict[UUID, int]) -> dict[UUID, int]:
    """Return participant amounts in cents for a supported split type."""
    _validate_base(amount_cents, participant_values)

    if split_type == "equal":
        base = amount_cents // len(participant_values)
        return _with_remainder({user_id: base for user_id in participant_values}, amount_cents)

    if split_type == "exact":
        if any(value < 0 for value in participant_values.values()):
            raise DomainError("invalid_participant", "Participant amounts cannot be negative.")
        if sum(participant_values.values()) != amount_cents:
            raise DomainError("invalid_split", "Exact split amounts must match the expense amount.")
        return dict(participant_values)

    if split_type == "shares":
        if any(value <= 0 for value in participant_values.values()):
            raise DomainError("invalid_participant", "Share weights must be positive.")
        total_weight = sum(participant_values.values())
        amounts = {user_id: amount_cents * weight // total_weight for user_id, weight in participant_values.items()}
        return _with_remainder(amounts, amount_cents)

    if split_type == "percent":
        if any(value < 0 for value in participant_values.values()):
            raise DomainError("invalid_participant", "Percent values cannot be negative.")
        if sum(participant_values.values()) != 100:
            raise DomainError("invalid_split", "Percent split values must add up to 100.")
        amounts = {user_id: amount_cents * percent // 100 for user_id, percent in participant_values.items()}
        return _with_remainder(amounts, amount_cents)

    raise DomainError("invalid_split", "Split type is not supported.")


def _validate_base(amount_cents: int, participant_values: dict[UUID, int]) -> None:
    """Validate rules shared by all split types."""
    if amount_cents <= 0:
        raise DomainError("invalid_amount", "Expense amount must be positive.")
    if not participant_values:
        raise DomainError("invalid_participant", "At least one participant is required.")


def _with_remainder(amounts: dict[UUID, int], total: int) -> dict[UUID, int]:
    """Add leftover cents in stable participant id order."""
    result = dict(amounts)
    for user_id in sorted(result, key=str)[: total - sum(result.values())]:
        result[user_id] += 1
    return result
