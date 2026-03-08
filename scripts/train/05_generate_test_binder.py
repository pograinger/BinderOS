"""
05_generate_test_binder.py — Claude-powered test binder generator.

Generates a rich, coherent binder of ~90 atoms about one fictional person's
life using the Anthropic Claude API. Output is a JSON file that BinderOS can
import in dev mode via window.__importTestBinder().

Multi-step pipeline:
  1. Generate persona (name, job, projects, areas)
  2. Create section items with UUIDs
  3. Generate atoms in batches per project/area
  4. Generate cross-links across the full atom set
  5. Generate inbox items
  6. Assemble, validate, and write JSON

Usage:
    python 05_generate_test_binder.py
    python 05_generate_test_binder.py --model claude-haiku-4-5
    python 05_generate_test_binder.py --atoms 120

Prerequisites:
    - ANTHROPIC_API_KEY in .env.local at the repo root
    - pip install -r requirements.txt
"""

import argparse
import json
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=_REPO_ROOT / ".env.local")

import anthropic  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Well-known section IDs from src/storage/migrations/v1.ts
SECTION_IDS = {
    "projects": "10000000-0000-4000-8000-000000000001",
    "areas": "10000000-0000-4000-8000-000000000002",
    "resources": "10000000-0000-4000-8000-000000000003",
    "archive": "10000000-0000-4000-8000-000000000004",
}

DEFAULT_MODEL = "claude-haiku-4-5"
DEFAULT_ATOM_TARGET = 90
MAX_TOKENS_PERSONA = 2048
MAX_TOKENS_BATCH = 4096
MAX_TOKENS_LINKS = 8192
MAX_TOKENS_INBOX = 2048
MAX_RETRIES = 3
SLEEP_BETWEEN_CALLS = 0.5

OUTPUT_PATH = _REPO_ROOT / "scripts" / "train" / "test-binder.json"

ATOM_TYPES = ["task", "fact", "event", "decision", "insight"]
STATUSES = ["open", "in-progress", "waiting", "done", "cancelled"]
ENERGY_LEVELS = ["Quick", "Medium", "Deep"]

# ---------------------------------------------------------------------------
# Schemas for structured output
# ---------------------------------------------------------------------------

PERSONA_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "age": {"type": "integer"},
        "job": {"type": "string"},
        "location": {"type": "string"},
        "familySituation": {"type": "string"},
        "currentChallenges": {"type": "string"},
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["name", "description"],
                "additionalProperties": False,
            },
        },
        "areas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["name", "description"],
                "additionalProperties": False,
            },
        },
        "resources": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["name", "description"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "name", "age", "job", "location", "familySituation",
        "currentChallenges", "projects", "areas", "resources",
    ],
    "additionalProperties": False,
}

BATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "atoms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ATOM_TYPES,
                    },
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": STATUSES,
                    },
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "staleDays": {"type": "integer"},
                    "energy": {
                        "type": ["string", "null"],
                    },
                    "dueDateDaysFromNow": {"type": ["integer", "null"]},
                    "eventDateDaysFromNow": {"type": ["integer", "null"]},
                },
                "required": [
                    "id", "type", "title", "content", "status",
                    "tags", "staleDays",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["atoms"],
    "additionalProperties": False,
}

LINKS_SCHEMA = {
    "type": "object",
    "properties": {
        "links": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sourceId": {"type": "string"},
                    "targetId": {"type": "string"},
                    "relationshipType": {
                        "type": "string",
                        "enum": ["relates-to", "depends-on", "belongs-to", "mentions"],
                    },
                },
                "required": ["sourceId", "targetId", "relationshipType"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["links"],
    "additionalProperties": False,
}

INBOX_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "staleDays": {"type": "integer"},
                },
                "required": ["id", "title", "content", "staleDays"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["items"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# API call with retry
# ---------------------------------------------------------------------------

def call_claude(
    client: anthropic.Anthropic,
    model: str,
    prompt: str,
    schema: dict,
    max_tokens: int,
) -> dict:
    """Make a structured-output Claude API call with retry logic."""
    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": schema,
                    }
                },
            )
            return json.loads(response.content[0].text)
        except anthropic.RateLimitError:
            wait = 2 ** attempt * 5
            print(f"\n[Rate limit] Waiting {wait}s before retry {attempt + 1}/{MAX_RETRIES}...")
            time.sleep(wait)
        except anthropic.APIError as e:
            wait = 2 ** attempt
            print(f"\n[API error] {e} — retry {attempt + 1}/{MAX_RETRIES} in {wait}s")
            time.sleep(wait)
        except json.JSONDecodeError as e:
            print(f"\n[JSON parse error] {e}")
            if attempt == MAX_RETRIES - 1:
                raise
            time.sleep(1)

    raise RuntimeError("All retries exhausted")


# ---------------------------------------------------------------------------
# Step 1: Generate persona
# ---------------------------------------------------------------------------

def generate_persona(client: anthropic.Anthropic, model: str) -> dict:
    """Generate a detailed fictional persona."""
    print("\n=== Step 1: Generating Persona ===")

    prompt = """Create a detailed fictional persona for a GTD (Getting Things Done) productivity system user.

This person should feel real and relatable — someone with a mix of professional and personal projects,
ongoing life areas they maintain, and reference materials they keep.

Requirements:
- 4-5 active projects (things with a clear end state: renovation, product launch, trip planning, etc.)
- 3-4 life areas (ongoing responsibilities: health, finances, relationships, career development, etc.)
- 1-2 resource categories (reference material collections: recipes, reading list, professional contacts, etc.)
- Make one project nearly complete (most tasks done) — this tests "project without next action" detection
- Make one area empty (described but no atoms yet) — this tests "area gap" detection
- Include a mix of work and personal life
- The person should have some current stress/challenges that make the binder feel authentic

Be creative but realistic. This is a real person's life captured in a productivity system."""

    persona = call_claude(client, model, prompt, PERSONA_SCHEMA, MAX_TOKENS_PERSONA)

    print(f"  Name: {persona['name']}")
    print(f"  Age: {persona['age']}, {persona['job']}")
    print(f"  Location: {persona['location']}")
    print(f"  Projects: {', '.join(p['name'] for p in persona['projects'])}")
    print(f"  Areas: {', '.join(a['name'] for a in persona['areas'])}")
    print(f"  Resources: {', '.join(r['name'] for r in persona['resources'])}")

    return persona


# ---------------------------------------------------------------------------
# Step 2: Create section items with UUIDs
# ---------------------------------------------------------------------------

def create_section_items(persona: dict) -> tuple[list[dict], dict[str, dict]]:
    """Create section items from persona, assign UUIDs, return items and lookup map."""
    print("\n=== Step 2: Creating Section Items ===")

    section_items = []
    si_map = {}  # name -> {id, sectionId}

    for project in persona["projects"]:
        item_id = str(uuid.uuid4())
        item = {
            "id": item_id,
            "sectionId": SECTION_IDS["projects"],
            "name": project["name"],
            "description": project["description"],
        }
        section_items.append(item)
        si_map[project["name"]] = {"id": item_id, "sectionId": SECTION_IDS["projects"]}

    for area in persona["areas"]:
        item_id = str(uuid.uuid4())
        item = {
            "id": item_id,
            "sectionId": SECTION_IDS["areas"],
            "name": area["name"],
            "description": area["description"],
        }
        section_items.append(item)
        si_map[area["name"]] = {"id": item_id, "sectionId": SECTION_IDS["areas"]}

    for resource in persona["resources"]:
        item_id = str(uuid.uuid4())
        item = {
            "id": item_id,
            "sectionId": SECTION_IDS["resources"],
            "name": resource["name"],
            "description": resource["description"],
        }
        section_items.append(item)
        si_map[resource["name"]] = {"id": item_id, "sectionId": SECTION_IDS["resources"]}

    print(f"  Created {len(section_items)} section items")
    return section_items, si_map


# ---------------------------------------------------------------------------
# Step 3: Generate atoms in batches
# ---------------------------------------------------------------------------

def generate_atom_batch(
    client: anthropic.Anthropic,
    model: str,
    persona: dict,
    section_name: str,
    section_type: str,
    atom_count: int,
    existing_atoms: list[dict],
) -> list[dict]:
    """Generate a batch of atoms for one section item."""
    # Pre-generate UUIDs
    atom_ids = [str(uuid.uuid4()) for _ in range(atom_count)]
    id_list = "\n".join(f"  - Atom {i+1}: {aid}" for i, aid in enumerate(atom_ids))

    # Build context from existing atoms
    existing_summary = ""
    if existing_atoms:
        summaries = [f"  - [{a['type']}] {a['title']}" for a in existing_atoms[:30]]
        existing_summary = (
            "\nAtoms already created (for coherence, "
            "reference these naturally):\n"
            + "\n".join(summaries)
        )

    prompt = f"""Generate {atom_count} realistic GTD atoms for {persona['name']}'s "{section_name}" {section_type}.

Persona: {persona['name']}, {persona['age']}, {persona['job']} in {persona['location']}.
Family: {persona['familySituation']}
Challenges: {persona['currentChallenges']}
{existing_summary}

Use EXACTLY these UUIDs as the "id" field for each atom:
{id_list}

Requirements:
- Mix of types: tasks (~40%), facts (~20%), events (~15%), decisions (~15%), insights (~10%)
- Status distribution: ~40% open, ~20% in-progress, ~15% waiting, ~20% done, ~5% cancelled
- Set staleDays to 0 for recent items, 30-90 for stale items. About 20% should be stale (staleDays > 30).
- For tasks: set energy to "Quick", "Medium", or "Deep" (null for non-tasks)
- For tasks with deadlines: set dueDateDaysFromNow (positive = future, negative = overdue)
- For events: set eventDateDaysFromNow (positive = future, negative = past)
- Use 2-4 realistic tags per atom from a consistent taxonomy
- Content should be 1-3 sentences, detailed and realistic
- Titles should be concise (3-8 words)
- Make the atoms tell a coherent story about this person's life in this area
- Some done/cancelled items show progress and decisions made over time"""

    result = call_claude(client, model, prompt, BATCH_SCHEMA, MAX_TOKENS_BATCH)
    return result["atoms"]


def generate_orphan_batch(
    client: anthropic.Anthropic,
    model: str,
    persona: dict,
    atom_count: int,
) -> list[dict]:
    """Generate atoms not assigned to any section item (orphans for compression testing)."""
    atom_ids = [str(uuid.uuid4()) for _ in range(atom_count)]
    id_list = "\n".join(f"  - Atom {i+1}: {aid}" for i, aid in enumerate(atom_ids))

    prompt = f"""Generate {atom_count} miscellaneous GTD atoms for {persona['name']} that don't belong to any specific project or area.

These are scattered thoughts, one-off tasks, random facts, and miscellaneous items that
haven't been organized yet. They should feel like real inbox items that got classified
but never filed into a project.

Persona: {persona['name']}, {persona['age']}, {persona['job']} in {persona['location']}.

Use EXACTLY these UUIDs as the "id" field:
{id_list}

Requirements:
- ALL of these should have staleDays between 40-90 (they're old and forgotten)
- Mix of types but lean toward facts and insights
- Status should be mostly "open" (never acted on)
- These are compression candidates — stale items with no clear project home
- energy can be null for most
- dueDateDaysFromNow and eventDateDaysFromNow should be null
- Tags should be sparse (0-1 tags)
- Content should be brief"""

    result = call_claude(client, model, prompt, BATCH_SCHEMA, MAX_TOKENS_BATCH)
    return result["atoms"]


def generate_all_atoms(
    client: anthropic.Anthropic,
    model: str,
    persona: dict,
    si_map: dict[str, dict],
    target_total: int,
) -> list[dict]:
    """Generate all atoms across projects, areas, and orphans."""
    print("\n=== Step 3: Generating Atoms ===")

    all_section_names = list(si_map.keys())
    # Find the empty area (last area — the one marked for "area gap" testing)
    empty_area = persona["areas"][-1]["name"]

    # Calculate atoms per section (excluding empty area)
    active_sections = [name for name in all_section_names if name != empty_area]
    orphan_count = 8  # stale orphans for compression testing
    atoms_for_sections = target_total - orphan_count
    per_section = max(6, atoms_for_sections // len(active_sections))

    all_atoms = []

    for section_name in tqdm(active_sections, desc="  Sections"):
        si = si_map[section_name]
        section_type = "project" if si["sectionId"] == SECTION_IDS["projects"] else "area"
        if si["sectionId"] == SECTION_IDS["resources"]:
            section_type = "resource collection"

        batch = generate_atom_batch(
            client, model, persona, section_name, section_type,
            per_section, all_atoms,
        )

        # Attach section info to each atom
        for atom in batch:
            atom["sectionId"] = si["sectionId"]
            atom["sectionItemId"] = si["id"]

        all_atoms.extend(batch)
        time.sleep(SLEEP_BETWEEN_CALLS)

    # Generate orphan atoms
    print("  Generating orphan atoms (compression candidates)...")
    orphans = generate_orphan_batch(client, model, persona, orphan_count)
    # Orphans have no sectionId/sectionItemId
    for atom in orphans:
        atom["sectionId"] = None
        atom["sectionItemId"] = None
    all_atoms.extend(orphans)

    print(f"  Total atoms generated: {len(all_atoms)}")

    # Summary by type
    type_counts = {}
    for a in all_atoms:
        type_counts[a["type"]] = type_counts.get(a["type"], 0) + 1
    print(f"  Type distribution: {type_counts}")

    return all_atoms


# ---------------------------------------------------------------------------
# Step 4: Generate cross-links
# ---------------------------------------------------------------------------

def generate_cross_links(
    client: anthropic.Anthropic,
    model: str,
    atoms: list[dict],
) -> list[dict]:
    """Generate meaningful cross-links between atoms."""
    print("\n=== Step 4: Generating Cross-Links ===")

    # Build atom summary for Claude
    atom_summaries = []
    for a in atoms:
        atom_summaries.append(f"  {a['id']}: [{a['type']}] {a['title']}")
    atom_list = "\n".join(atom_summaries)

    prompt = f"""Given these GTD atoms, create meaningful cross-links between them.

Atoms:
{atom_list}

Generate 30-40 links that represent real relationships:
- "relates-to": general topical or contextual connection
- "depends-on": one item must happen before another (tasks mainly)
- "belongs-to": an item is part of a larger initiative
- "mentions": one item references another

Rules:
- Use the exact UUIDs from the atom list as sourceId and targetId
- Don't link every atom — about 30-40% of atoms should remain unlinked (for compression candidate testing)
- Prefer links that cross section boundaries (a health insight linked to a work task, etc.)
- Create some dependency chains (A depends on B depends on C)
- Facts and decisions often get "mentions" links from tasks
- Events often "relates-to" tasks that prepare for them"""

    result = call_claude(client, model, prompt, LINKS_SCHEMA, MAX_TOKENS_LINKS)

    # Validate links — remove any with invalid IDs
    valid_ids = {a["id"] for a in atoms}
    valid_links = []
    invalid_count = 0
    for link in result["links"]:
        if link["sourceId"] in valid_ids and link["targetId"] in valid_ids:
            valid_links.append(link)
        else:
            invalid_count += 1

    if invalid_count > 0:
        print(f"  Removed {invalid_count} links with invalid IDs")

    print(f"  Generated {len(valid_links)} valid cross-links")
    return valid_links


# ---------------------------------------------------------------------------
# Step 5: Generate inbox items
# ---------------------------------------------------------------------------

def generate_inbox_items(
    client: anthropic.Anthropic,
    model: str,
    persona: dict,
) -> list[dict]:
    """Generate unprocessed inbox items for triage testing."""
    print("\n=== Step 5: Generating Inbox Items ===")

    item_ids = [str(uuid.uuid4()) for _ in range(10)]
    id_list = "\n".join(f"  - Item {i+1}: {iid}" for i, iid in enumerate(item_ids))

    prompt = f"""Generate 10 unprocessed inbox items for {persona['name']}'s GTD inbox.

These are raw captures — quick notes, reminders, ideas — that haven't been classified yet.
They should feel like things someone jotted down quickly.

Persona: {persona['name']}, {persona['age']}, {persona['job']} in {persona['location']}.
Family: {persona['familySituation']}

Use EXACTLY these UUIDs as the "id" field:
{id_list}

Requirements:
- Mix of things that will become tasks, facts, events, decisions, and insights when classified
- Some should be vague/ambiguous (hard to classify — tests the AI triage)
- 3-4 items should have staleDays 7-21 (getting stale in inbox)
- The rest should have staleDays 0 (fresh captures)
- Titles: 3-8 words, how someone would quickly jot a note
- Content: 1-2 sentences of detail"""

    result = call_claude(client, model, prompt, INBOX_SCHEMA, MAX_TOKENS_INBOX)
    print(f"  Generated {len(result['items'])} inbox items")
    return result["items"]


# ---------------------------------------------------------------------------
# Step 6: Assemble and validate
# ---------------------------------------------------------------------------

DAY_MS = 86_400_000


def assemble_binder(
    persona: dict,
    section_items: list[dict],
    atoms: list[dict],
    links: list[dict],
    inbox_items: list[dict],
) -> dict:
    """Assemble all pieces into the final binder JSON."""
    print("\n=== Step 6: Assembling Binder ===")

    now_ms = int(datetime.now().timestamp() * 1000)

    # Apply links to atoms (both forward and backward)
    atom_links: dict[str, list[dict]] = {a["id"]: [] for a in atoms}
    for link in links:
        atom_links[link["sourceId"]].append({
            "targetId": link["targetId"],
            "relationshipType": link["relationshipType"],
            "direction": "forward",
        })
        atom_links[link["targetId"]].append({
            "targetId": link["sourceId"],
            "relationshipType": link["relationshipType"],
            "direction": "backward",
        })

    # Build final atom records
    final_atoms = []
    for a in atoms:
        atom = {
            "id": a["id"],
            "type": a["type"],
            "title": a["title"],
            "content": a["content"],
            "status": a["status"],
            "tags": a.get("tags", []),
            "links": atom_links.get(a["id"], []),
            "staleDays": a.get("staleDays", 0),
        }

        if a.get("sectionId"):
            atom["sectionId"] = a["sectionId"]
        if a.get("sectionItemId"):
            atom["sectionItemId"] = a["sectionItemId"]

        # Convert relative dates to absolute timestamps
        due_days = a.get("dueDateDaysFromNow")
        if due_days is not None:
            atom["dueDate"] = now_ms + due_days * DAY_MS

        event_days = a.get("eventDateDaysFromNow")
        if event_days is not None:
            atom["eventDate"] = now_ms + event_days * DAY_MS

        energy = a.get("energy")
        if energy in ("Quick", "Medium", "Deep"):
            atom["energy"] = energy

        final_atoms.append(atom)

    # Build final inbox items
    final_inbox = []
    for item in inbox_items:
        final_inbox.append({
            "id": item["id"],
            "title": item["title"],
            "content": item["content"],
            "staleDays": item.get("staleDays", 0),
        })

    binder = {
        "meta": {
            "generatedAt": datetime.now().isoformat(),
            "personaName": persona["name"],
            "atomCount": len(final_atoms),
            "version": 1,
        },
        "sectionItems": section_items,
        "atoms": final_atoms,
        "inboxItems": final_inbox,
    }

    # Validation
    all_atom_ids = {a["id"] for a in final_atoms}
    dangling = 0
    for a in final_atoms:
        for link in a["links"]:
            if link["targetId"] not in all_atom_ids:
                dangling += 1

    stale_count = sum(1 for a in final_atoms if a.get("staleDays", 0) > 30)
    orphan_stale = sum(
        1 for a in final_atoms
        if a.get("staleDays", 0) > 30 and len(a["links"]) == 0
    )
    linked_count = sum(1 for a in final_atoms if len(a["links"]) > 0)

    print(f"  Atoms: {len(final_atoms)}")
    print(f"  Inbox items: {len(final_inbox)}")
    print(f"  Links: {sum(len(a['links']) for a in final_atoms) // 2} (bidirectional)")
    print(f"  Stale atoms: {stale_count}")
    print(f"  Compression candidates: {orphan_stale}")
    print(f"  Linked atoms: {linked_count}")
    if dangling > 0:
        print(f"  WARNING: {dangling} dangling link references found!")

    return binder


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a rich test binder via Claude API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--atoms",
        type=int,
        default=DEFAULT_ATOM_TARGET,
        help=f"Target atom count (default: {DEFAULT_ATOM_TARGET})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Output file path (default: {OUTPUT_PATH})",
    )
    args = parser.parse_args()

    if args.atoms < 30:
        print("[ERROR] --atoms must be at least 30", file=sys.stderr)
        sys.exit(1)

    # Check API key
    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "\n[ERROR] ANTHROPIC_API_KEY not found in environment or .env.local\n"
            "Set it in .env.local at the repo root: ANTHROPIC_API_KEY=sk-ant-...",
            file=sys.stderr,
        )
        sys.exit(1)

    print("=== BinderOS Test Binder Generator ===")
    print(f"Model: {args.model}")
    print(f"Target atoms: {args.atoms}")
    print(f"Output: {args.output}")

    client = anthropic.Anthropic()

    # Pipeline
    persona = generate_persona(client, args.model)
    time.sleep(SLEEP_BETWEEN_CALLS)

    section_items, si_map = create_section_items(persona)

    atoms = generate_all_atoms(client, args.model, persona, si_map, args.atoms)
    time.sleep(SLEEP_BETWEEN_CALLS)

    links = generate_cross_links(client, args.model, atoms)
    time.sleep(SLEEP_BETWEEN_CALLS)

    inbox_items = generate_inbox_items(client, args.model, persona)

    binder = assemble_binder(persona, section_items, atoms, links, inbox_items)

    # Write output
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(binder, f, indent=2, ensure_ascii=False)

    print("\n=== DONE ===")
    print(f"Binder written to: {args.output}")
    print("Import in BinderOS dev mode: window.__importTestBinder()")


if __name__ == "__main__":
    main()
