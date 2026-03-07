"""
10_generate_sanitization_data.py — Synthetic BIO-tagged NER Training Data Generator

Generates labeled NER training examples for the BinderOS sanitization classifier
using Faker-generated PII entities embedded in atom-style text templates.

Output: scripts/training-data/sanitization-ner.jsonl
        (one JSON object per line: {"tokens": [...], "ner_tags": [...]})

Also saves: scripts/train/sanitization_label_map.json

Usage:
    python 10_generate_sanitization_data.py                 # Generate 4000 examples
    python 10_generate_sanitization_data.py --count 100     # Generate 100 examples

Entity categories (BIO-tagged):
    O=0, B-PERSON=1, I-PERSON=2, B-LOCATION=3, I-LOCATION=4,
    B-FINANCIAL=5, I-FINANCIAL=6, B-CONTACT=7, I-CONTACT=8,
    B-CREDENTIAL=9, I-CREDENTIAL=10
"""

import argparse
import json
import random
import string
import sys
from pathlib import Path

from faker import Faker

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent

OUTPUT_PATH = REPO_ROOT / "scripts" / "training-data" / "sanitization-ner.jsonl"
LABEL_MAP_PATH = SCRIPT_DIR / "sanitization_label_map.json"

# ---------------------------------------------------------------------------
# Label mapping
# ---------------------------------------------------------------------------
LABEL_MAP = {
    "O": 0,
    "B-PERSON": 1, "I-PERSON": 2,
    "B-LOCATION": 3, "I-LOCATION": 4,
    "B-FINANCIAL": 5, "I-FINANCIAL": 6,
    "B-CONTACT": 7, "I-CONTACT": 8,
    "B-CREDENTIAL": 9, "I-CREDENTIAL": 10,
}

ID_TO_LABEL = {v: k for k, v in LABEL_MAP.items()}

# ---------------------------------------------------------------------------
# Faker setup with multiple locales for diversity
# ---------------------------------------------------------------------------
fake = Faker("en_US")
Faker.seed(42)
random.seed(42)


# ---------------------------------------------------------------------------
# Entity generators
# ---------------------------------------------------------------------------

def gen_person() -> str:
    """Generate a person name with variety."""
    choice = random.random()
    if choice < 0.3:
        return fake.first_name() + " " + fake.last_name()
    elif choice < 0.5:
        return fake.name()  # May include prefix/suffix
    elif choice < 0.65:
        return fake.first_name()  # Single name
    elif choice < 0.75:
        # Hyphenated last name
        return fake.first_name() + " " + fake.last_name() + "-" + fake.last_name()
    elif choice < 0.85:
        # Initial + last name
        return fake.first_name()[0] + ". " + fake.last_name()
    else:
        # Three part name
        return fake.first_name() + " " + fake.first_name() + " " + fake.last_name()


def gen_location() -> str:
    """Generate a location with variety."""
    choice = random.random()
    if choice < 0.25:
        return fake.city()
    elif choice < 0.4:
        return fake.city() + ", " + fake.state_abbr()
    elif choice < 0.55:
        return fake.state()
    elif choice < 0.65:
        return fake.country()
    elif choice < 0.75:
        return fake.street_address()
    elif choice < 0.85:
        # Multi-word city like "New York"
        cities = ["New York", "San Francisco", "Los Angeles", "Las Vegas",
                  "Salt Lake City", "Kansas City", "St. Louis", "El Paso",
                  "Fort Worth", "Grand Rapids", "Baton Rouge", "San Diego"]
        return random.choice(cities)
    else:
        return fake.address().split("\n")[0]  # Street address only


def gen_financial() -> str:
    """Generate a financial reference."""
    choice = random.random()
    if choice < 0.35:
        amount = random.randint(100, 999999)
        return f"${amount:,}.00"
    elif choice < 0.5:
        amount = random.randint(10, 9999)
        cents = random.randint(0, 99)
        return f"${amount:,}.{cents:02d}"
    elif choice < 0.65:
        amount = random.randint(1000, 50000)
        return f"${amount:,}"
    elif choice < 0.75:
        # Credit card (masked)
        return fake.credit_card_number()
    elif choice < 0.85:
        # Account number
        return f"Acct #{random.randint(100000, 999999)}"
    else:
        # Invoice number
        return f"INV-{random.randint(1000, 99999)}"


def gen_contact() -> str:
    """Generate a contact info entity."""
    choice = random.random()
    if choice < 0.35:
        return fake.email()
    elif choice < 0.55:
        return fake.phone_number()
    elif choice < 0.7:
        # Simple email pattern
        first = fake.first_name().lower()
        last = fake.last_name().lower()
        domain = random.choice(["gmail.com", "outlook.com", "yahoo.com", "company.com", "work.org"])
        return f"{first}.{last}@{domain}"
    elif choice < 0.85:
        # US phone format
        return f"({random.randint(200,999)}) {random.randint(200,999)}-{random.randint(1000,9999)}"
    else:
        # International format
        return f"+1-{random.randint(200,999)}-{random.randint(200,999)}-{random.randint(1000,9999)}"


def gen_credential() -> str:
    """Generate a credential/API key entity."""
    choice = random.random()
    hex_chars = string.ascii_lowercase + string.digits
    if choice < 0.2:
        # OpenAI style
        return "sk-" + "".join(random.choices(hex_chars, k=48))
    elif choice < 0.35:
        # Anthropic style
        return "sk-ant-" + "".join(random.choices(hex_chars, k=40))
    elif choice < 0.5:
        # GitHub token
        return "ghp_" + "".join(random.choices(string.ascii_letters + string.digits, k=36))
    elif choice < 0.65:
        # Generic API key
        return "api_key_" + "".join(random.choices(hex_chars, k=32))
    elif choice < 0.75:
        # Bearer token
        return "bearer_" + "".join(random.choices(hex_chars, k=40))
    elif choice < 0.85:
        # Password-like
        return "".join(random.choices(string.ascii_letters + string.digits + "!@#$%", k=random.randint(12, 24)))
    else:
        # Secret key
        return "secret_" + "".join(random.choices(hex_chars, k=24))


ENTITY_GENERATORS = {
    "PERSON": gen_person,
    "LOCATION": gen_location,
    "FINANCIAL": gen_financial,
    "CONTACT": gen_contact,
    "CREDENTIAL": gen_credential,
}


# ---------------------------------------------------------------------------
# Templates — atom-style text with entity placeholders
# ---------------------------------------------------------------------------
# Format: (template_string, list_of_entity_category_placeholders)
# Placeholders use {CATEGORY} syntax

TEMPLATES = [
    # PERSON only
    ("Meeting with {PERSON} tomorrow morning", ["PERSON"]),
    ("Follow up with {PERSON} about the project", ["PERSON"]),
    ("Call {PERSON} to discuss deliverables", ["PERSON"]),
    ("{PERSON} approved the budget request", ["PERSON"]),
    ("Assigned task to {PERSON}", ["PERSON"]),
    ("Waiting on {PERSON} for final review", ["PERSON"]),
    ("Schedule 1:1 with {PERSON}", ["PERSON"]),
    ("{PERSON} will handle the client presentation", ["PERSON"]),
    ("Get feedback from {PERSON} on the proposal", ["PERSON"]),
    ("Remind {PERSON} about the deadline", ["PERSON"]),

    # PERSON + PERSON
    ("Introduce {PERSON} to {PERSON}", ["PERSON", "PERSON"]),
    ("{PERSON} and {PERSON} are leading the initiative", ["PERSON", "PERSON"]),
    ("Set up meeting between {PERSON} and {PERSON}", ["PERSON", "PERSON"]),

    # LOCATION only
    ("Conference room booked at {LOCATION}", ["LOCATION"]),
    ("Traveling to {LOCATION} next week", ["LOCATION"]),
    ("Office relocation to {LOCATION} planned for Q2", ["LOCATION"]),
    ("Team offsite in {LOCATION}", ["LOCATION"]),
    ("Shipment arriving from {LOCATION}", ["LOCATION"]),

    # PERSON + LOCATION
    ("Meeting with {PERSON} at {LOCATION}", ["PERSON", "LOCATION"]),
    ("{PERSON} is relocating to {LOCATION}", ["PERSON", "LOCATION"]),
    ("Send {PERSON} to the {LOCATION} office", ["PERSON", "LOCATION"]),
    ("Lunch with {PERSON} at the {LOCATION} restaurant", ["PERSON", "LOCATION"]),
    ("{PERSON} flying to {LOCATION} for the conference", ["PERSON", "LOCATION"]),
    ("Interview {PERSON} at the {LOCATION} campus", ["PERSON", "LOCATION"]),

    # FINANCIAL only
    ("Budget allocation: {FINANCIAL}", ["FINANCIAL"]),
    ("Invoice total: {FINANCIAL}", ["FINANCIAL"]),
    ("Expense report for {FINANCIAL}", ["FINANCIAL"]),
    ("Payment of {FINANCIAL} received", ["FINANCIAL"]),
    ("Quarterly revenue: {FINANCIAL}", ["FINANCIAL"]),
    ("Approve purchase order for {FINANCIAL}", ["FINANCIAL"]),

    # PERSON + FINANCIAL
    ("Pay {PERSON} {FINANCIAL} for consulting", ["PERSON", "FINANCIAL"]),
    ("{PERSON} submitted expense report for {FINANCIAL}", ["PERSON", "FINANCIAL"]),
    ("Invoice from {PERSON} for {FINANCIAL}", ["PERSON", "FINANCIAL"]),
    ("Reimburse {PERSON} {FINANCIAL}", ["PERSON", "FINANCIAL"]),
    ("{PERSON} approved the {FINANCIAL} budget", ["PERSON", "FINANCIAL"]),

    # CONTACT only
    ("Reach out via {CONTACT}", ["CONTACT"]),
    ("Updated contact info: {CONTACT}", ["CONTACT"]),
    ("Send the report to {CONTACT}", ["CONTACT"]),
    ("New subscriber: {CONTACT}", ["CONTACT"]),

    # PERSON + CONTACT
    ("Email {PERSON} at {CONTACT}", ["PERSON", "CONTACT"]),
    ("{PERSON} can be reached at {CONTACT}", ["PERSON", "CONTACT"]),
    ("Contact {PERSON} via {CONTACT} for scheduling", ["PERSON", "CONTACT"]),
    ("Send invitation to {PERSON} at {CONTACT}", ["PERSON", "CONTACT"]),
    ("{PERSON}'s new number is {CONTACT}", ["PERSON", "CONTACT"]),

    # CREDENTIAL only
    ("API key for production: {CREDENTIAL}", ["CREDENTIAL"]),
    ("Store the access token: {CREDENTIAL}", ["CREDENTIAL"]),
    ("New service credential: {CREDENTIAL}", ["CREDENTIAL"]),
    ("Rotate the API key {CREDENTIAL}", ["CREDENTIAL"]),
    ("Database password: {CREDENTIAL}", ["CREDENTIAL"]),
    ("Deployment secret: {CREDENTIAL}", ["CREDENTIAL"]),

    # PERSON + CREDENTIAL
    ("{PERSON} shared the API key: {CREDENTIAL}", ["PERSON", "CREDENTIAL"]),
    ("Reset {PERSON}'s access token to {CREDENTIAL}", ["PERSON", "CREDENTIAL"]),

    # LOCATION + FINANCIAL
    ("{LOCATION} office rent: {FINANCIAL} per month", ["LOCATION", "FINANCIAL"]),
    ("Travel to {LOCATION} cost {FINANCIAL}", ["LOCATION", "FINANCIAL"]),

    # Multi-entity
    ("{PERSON} will transfer {FINANCIAL} to {PERSON}", ["PERSON", "FINANCIAL", "PERSON"]),
    ("Ship {FINANCIAL} worth of equipment to {LOCATION}", ["FINANCIAL", "LOCATION"]),
    ("{PERSON} at {LOCATION} submitted invoice for {FINANCIAL}", ["PERSON", "LOCATION", "FINANCIAL"]),
    ("Contact {PERSON} at {CONTACT} about the {FINANCIAL} payment", ["PERSON", "CONTACT", "FINANCIAL"]),
    ("{PERSON} from {LOCATION} needs access token {CREDENTIAL}", ["PERSON", "LOCATION", "CREDENTIAL"]),
]

# Negative templates — no PII
NEGATIVE_TEMPLATES = [
    "Buy groceries and clean the house",
    "Review the quarterly marketing strategy",
    "Update the project timeline in the shared document",
    "Prepare slides for the team standup",
    "Fix the broken unit tests in the CI pipeline",
    "Refactor the authentication module",
    "Write documentation for the new API endpoints",
    "Schedule the weekly planning session",
    "Check the deployment logs for errors",
    "Migrate the database schema to version 3",
    "Update dependencies in package.json",
    "Research competitor pricing strategies",
    "Draft the release notes for version 2.1",
    "Clean up unused CSS classes in the frontend",
    "Optimize the search indexing pipeline",
    "Run the performance benchmarks on staging",
    "Set up monitoring alerts for production",
    "Review pull requests from yesterday",
    "Plan the sprint retrospective agenda",
    "Back up the production database",
    "Test the new notification system end to end",
    "Finalize the product requirements document",
    "Archive completed tasks from last quarter",
    "Create automated regression test suite",
    "Investigate the memory leak in the worker thread",
    "Consolidate duplicate entries in the knowledge base",
    "Implement dark mode toggle in settings",
    "Add keyboard shortcuts for common actions",
    "Design the onboarding flow for new users",
    "Configure CORS headers for the staging environment",
    "Process the pending inbox items from this morning",
    "Review the action items from the last meeting",
    "Organize the project folder structure",
    "Update the build configuration for the new platform",
    "Create a summary report for stakeholders",
    "Triage incoming support tickets",
    "Evaluate options for the new hosting provider",
    "Draft a proposal for the automation initiative",
    "Complete the security audit checklist",
    "Prepare the demo environment for the client visit",
]


# ---------------------------------------------------------------------------
# BIO tagging logic
# ---------------------------------------------------------------------------

def tokenize_simple(text: str) -> list[tuple[str, int, int]]:
    """
    Simple whitespace + punctuation tokenizer.
    Returns list of (token, char_start, char_end) tuples.
    """
    tokens = []
    i = 0
    n = len(text)
    while i < n:
        # Skip whitespace
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            break
        # Read token
        start = i
        while i < n and not text[i].isspace():
            i += 1
        token = text[start:i]
        tokens.append((token, start, i))
    return tokens


def assign_bio_tags(
    tokens: list[tuple[str, int, int]],
    entities: list[tuple[int, int, str]],
) -> list[int]:
    """
    Assign BIO tags to tokens based on character-level entity spans.

    Args:
        tokens: List of (token_text, char_start, char_end)
        entities: List of (char_start, char_end, category)

    Returns:
        List of integer tags (one per token)
    """
    tags = [LABEL_MAP["O"]] * len(tokens)

    for ent_start, ent_end, category in entities:
        b_tag = LABEL_MAP[f"B-{category}"]
        i_tag = LABEL_MAP[f"I-{category}"]
        first_token = True

        for idx, (tok_text, tok_start, tok_end) in enumerate(tokens):
            # Token overlaps with entity span
            if tok_start >= ent_start and tok_end <= ent_end:
                if first_token:
                    tags[idx] = b_tag
                    first_token = False
                else:
                    tags[idx] = i_tag
            elif tok_start < ent_end and tok_end > ent_start:
                # Partial overlap — still tag it
                if first_token:
                    tags[idx] = b_tag
                    first_token = False
                else:
                    tags[idx] = i_tag

    return tags


def generate_sample_from_template(
    template: str, entity_categories: list[str]
) -> dict | None:
    """
    Fill a template with generated entities and produce BIO-tagged output.

    Returns {"tokens": [...], "ner_tags": [...]} or None on failure.
    """
    # Generate entity values
    entity_values = []
    for cat in entity_categories:
        entity_values.append((cat, ENTITY_GENERATORS[cat]()))

    # Build the text by replacing placeholders one at a time
    text = template
    entities = []  # (char_start, char_end, category)

    for cat, value in entity_values:
        placeholder = "{" + cat + "}"
        pos = text.find(placeholder)
        if pos == -1:
            return None  # Template issue
        text = text[:pos] + value + text[pos + len(placeholder):]
        entities.append((pos, pos + len(value), cat))

    # Tokenize
    tokens = tokenize_simple(text)
    if not tokens:
        return None

    # Assign BIO tags
    tags = assign_bio_tags(tokens, entities)

    return {
        "tokens": [t[0] for t in tokens],
        "ner_tags": tags,
    }


def generate_negative_sample(template: str) -> dict:
    """Generate a sample with all O tags (no entities)."""
    tokens = tokenize_simple(template)
    return {
        "tokens": [t[0] for t in tokens],
        "ner_tags": [0] * len(tokens),
    }


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

def generate(count: int) -> None:
    """Generate BIO-tagged NER training data."""
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    samples = []

    # Target ~30% negative, ~70% positive
    n_negative = int(count * 0.3)
    n_positive = count - n_negative

    print(f"\nGenerating {n_positive} positive samples and {n_negative} negative samples...")

    # Generate positive samples (with entities)
    for i in range(n_positive):
        template, categories = random.choice(TEMPLATES)
        sample = generate_sample_from_template(template, categories)
        if sample:
            samples.append(sample)

    # Generate negative samples (no entities)
    for i in range(n_negative):
        template = random.choice(NEGATIVE_TEMPLATES)
        # Add some variation
        sample = generate_negative_sample(template)
        samples.append(sample)

    # Shuffle
    random.shuffle(samples)

    # Write JSONL
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample) + "\n")

    print(f"\nWrote {len(samples)} samples to {OUTPUT_PATH}")

    # Save label map
    with open(LABEL_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(LABEL_MAP, f, indent=2)
    print(f"Saved label map to {LABEL_MAP_PATH}")

    # Print statistics
    print("\n=== Statistics ===")

    # Count entity categories
    category_counts = {cat: 0 for cat in ENTITY_GENERATORS}
    total_entities = 0
    positive_count = 0
    negative_count = 0

    for sample in samples:
        has_entity = any(t != 0 for t in sample["ner_tags"])
        if has_entity:
            positive_count += 1
        else:
            negative_count += 1

        for tag_id in sample["ner_tags"]:
            label = ID_TO_LABEL[tag_id]
            if label.startswith("B-"):
                cat = label[2:]
                category_counts[cat] += 1
                total_entities += 1

    print(f"Total samples:    {len(samples)}")
    print(f"Positive (PII):   {positive_count}")
    print(f"Negative (clean): {negative_count}")
    print(f"Total entities:   {total_entities}")
    print(f"\nEntities per category:")
    for cat, count in sorted(category_counts.items()):
        print(f"  {cat}: {count}")

    # Sample preview
    print("\n=== Sample Preview (first 3) ===")
    for i, sample in enumerate(samples[:3]):
        tokens = sample["tokens"]
        tags = [ID_TO_LABEL[t] for t in sample["ner_tags"]]
        print(f"\n[{i}] {' '.join(tokens)}")
        tagged = [(tok, tag) for tok, tag in zip(tokens, tags) if tag != "O"]
        if tagged:
            print(f"    Entities: {tagged}")
        else:
            print(f"    Entities: (none)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic BIO-tagged NER training data for sanitization classifier",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=4000,
        help="Number of samples to generate (default: 4000)",
    )
    args = parser.parse_args()

    if args.count < 10:
        print(f"[ERROR] --count must be at least 10, got {args.count}", file=sys.stderr)
        sys.exit(1)

    print(f"Target: {args.count} samples")
    print(f"Output: {OUTPUT_PATH}")
    print(f"Label map: {LABEL_MAP_PATH}")

    generate(count=args.count)


if __name__ == "__main__":
    main()
