import secrets

# Base-62 alphabet: digits + lowercase + uppercase = 62 characters
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
BASE = len(ALPHABET)  # 62


def encode_base62(n: int) -> str:
    """Encode a non-negative integer into a base-62 string (no padding)."""
    if n == 0:
        return ALPHABET[0]
    digits: list[str] = []
    while n:
        n, remainder = divmod(n, BASE)
        digits.append(ALPHABET[remainder])
    return "".join(reversed(digits))


def decode_base62(s: str) -> int:
    """Decode a base-62 string back to an integer."""
    n = 0
    for char in s:
        n = n * BASE + ALPHABET.index(char)
    return n


def generate_meeting_code() -> str:
    """
    Generate a unique meeting code using a random 64-bit integer encoded
    in base-62.

    Produces ~11 characters (62^11 ≈ 5.2 × 10^19 unique codes).
    Formatted as "XXXXXXX-XXXX" for readability (Zoom-style dashes).
    """
    n = secrets.randbits(64)  # cryptographically random 64-bit unsigned int
    raw = encode_base62(n)  # ~11 base-62 chars

    # Pad to 11 chars minimum so formatting is consistent
    raw = raw.ljust(11, "0")

    # Format as "XXXXXXX-XXXX" (7-4 split)
    return f"{raw[:7]}-{raw[7:11]}"


def strip_dashes(code: str) -> str:
    """Return the raw base-62 code without formatting dashes."""
    return code.replace("-", "")


def format_code(raw: str) -> str:
    """
    Add display dashes to a raw base-62 code.
    Handles codes of varying lengths gracefully.
    """
    raw = raw.replace("-", "")
    if len(raw) >= 11:
        return f"{raw[:7]}-{raw[7:11]}"
    return raw
