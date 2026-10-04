"""Computed balance helpers for groups."""

from uuid import UUID


def compute_group_balances(group) -> dict[UUID, int]:
    """Return group balances where positive values are owed money."""
    balances = {membership.user_id: 0 for membership in group.memberships.all()}

    for expense in group.expenses.filter(deleted=False).prefetch_related("shares"):
        balances.setdefault(expense.payer_id, 0)
        balances[expense.payer_id] += expense.amount_cents
        for share in expense.shares.all():
            balances.setdefault(share.user_id, 0)
            balances[share.user_id] -= share.amount_cents

    for settlement in group.settlements.filter(deleted=False):
        balances.setdefault(settlement.from_user_id, 0)
        balances.setdefault(settlement.to_user_id, 0)
        balances[settlement.from_user_id] += settlement.amount_cents
        balances[settlement.to_user_id] -= settlement.amount_cents

    return balances


def suggest_transfers(balances: dict[UUID, int]) -> list[dict]:
    """Return stable debtor-to-creditor transfers that settle the balances."""
    debtors = [[user_id, -amount] for user_id, amount in sorted(balances.items(), key=lambda item: (item[1], str(item[0]))) if amount < 0]
    creditors = [[user_id, amount] for user_id, amount in sorted(balances.items(), key=lambda item: (-item[1], str(item[0]))) if amount > 0]
    transfers = []
    debtor_index = 0
    creditor_index = 0

    while debtor_index < len(debtors) and creditor_index < len(creditors):
        from_user_id, debt = debtors[debtor_index]
        to_user_id, credit = creditors[creditor_index]
        amount = min(debt, credit)
        transfers.append({"from_user_id": from_user_id, "to_user_id": to_user_id, "amount_cents": amount})

        debtors[debtor_index][1] -= amount
        creditors[creditor_index][1] -= amount
        if debtors[debtor_index][1] == 0:
            debtor_index += 1
        if creditors[creditor_index][1] == 0:
            creditor_index += 1

    return transfers
