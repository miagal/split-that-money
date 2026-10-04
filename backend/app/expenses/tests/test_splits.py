"""Tests for expense split math helpers."""

from uuid import UUID

import pytest

from app.core.errors import DomainError
from app.expenses.splits import compute_split


USER_A = UUID("00000000-0000-0000-0000-00000000000a")
USER_B = UUID("00000000-0000-0000-0000-00000000000b")
USER_C = UUID("00000000-0000-0000-0000-00000000000c")


def test_equal_split_distributes_remainder_by_user_id_order():
    result = compute_split(100, "equal", {USER_C: 0, USER_A: 0, USER_B: 0})

    assert result == {USER_A: 34, USER_B: 33, USER_C: 33}


def test_exact_split_requires_values_to_sum_to_amount():
    assert compute_split(100, "exact", {USER_A: 40, USER_B: 60}) == {USER_A: 40, USER_B: 60}

    with pytest.raises(DomainError) as error:
        compute_split(100, "exact", {USER_A: 40, USER_B: 50})

    assert error.value.code == "invalid_split"


def test_shares_split_requires_positive_weights():
    assert compute_split(100, "shares", {USER_A: 1, USER_B: 2, USER_C: 3}) == {USER_A: 17, USER_B: 33, USER_C: 50}

    with pytest.raises(DomainError) as error:
        compute_split(100, "shares", {USER_A: 1, USER_B: 0})

    assert error.value.code == "invalid_participant"


def test_percent_split_requires_total_100():
    assert compute_split(101, "percent", {USER_A: 33, USER_B: 33, USER_C: 34}) == {
        USER_A: 34,
        USER_B: 33,
        USER_C: 34,
    }

    with pytest.raises(DomainError) as error:
        compute_split(100, "percent", {USER_A: 40, USER_B: 50})

    assert error.value.code == "invalid_split"


def test_split_rejects_invalid_amount_and_empty_participants():
    with pytest.raises(DomainError) as amount_error:
        compute_split(0, "equal", {USER_A: 0})

    with pytest.raises(DomainError) as participant_error:
        compute_split(100, "equal", {})

    assert amount_error.value.code == "invalid_amount"
    assert participant_error.value.code == "invalid_participant"
