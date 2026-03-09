"""
40_generate_clarification_data.py -- Synthetic Clarification Training Data Generator

Generates labeled classification training examples for six clarification classifiers
using Faker-generated entities embedded in template sentences.

Output: scripts/training-data/clarification-{name}.jsonl
        (one JSON object per line: {"text": "...", "label": "..."})

Classifiers:
    completeness         binary: complete, incomplete
    missing-outcome      binary: missing, not-missing
    missing-next-action  binary: missing, not-missing
    missing-timeframe    binary: missing, not-missing
    missing-context      binary: missing, not-missing
    missing-reference    binary: missing, not-missing

Usage:
    python -u 40_generate_clarification_data.py
    python -u 40_generate_clarification_data.py --count 500

Note: Use -u flag to avoid Python output buffering issues.
"""

import argparse
import json
import random
import sys
from pathlib import Path

from faker import Faker

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = REPO_ROOT / "scripts" / "training-data"

# ---------------------------------------------------------------------------
# Faker setup
# ---------------------------------------------------------------------------
fake = Faker("en_US")
Faker.seed(42)
random.seed(42)


# ---------------------------------------------------------------------------
# Helper: fill template with Faker data
# ---------------------------------------------------------------------------
def fill_template(template: str) -> str:
    """Replace {placeholder} tokens with Faker-generated values."""
    replacements = {
        "{person}": lambda: fake.name(),
        "{first_name}": lambda: fake.first_name(),
        "{last_name}": lambda: fake.last_name(),
        "{company}": lambda: fake.company(),
        "{topic}": lambda: random.choice([
            "the budget", "the project timeline", "the quarterly report",
            "the product launch", "the hiring plan", "the migration",
            "the contract renewal", "performance reviews", "the proposal",
            "the marketing strategy", "the redesign", "inventory counts",
            "the vendor agreement", "compliance requirements", "the rollout plan",
        ]),
        "{document}": lambda: random.choice([
            "the report", "the proposal", "the contract", "the spreadsheet",
            "the presentation", "the memo", "the invoice", "the brief",
            "the analysis", "the design doc", "the spec", "the summary",
        ]),
        "{item}": lambda: random.choice([
            "printer paper", "batteries", "coffee filters", "a new keyboard",
            "groceries", "light bulbs", "paint", "a gift card", "stamps",
            "envelopes", "cleaning supplies", "a phone charger", "notebooks",
        ]),
        "{store}": lambda: random.choice([
            "Target", "Costco", "Home Depot", "Walmart", "Best Buy",
            "Staples", "Office Depot", "Trader Joe's", "CVS", "Walgreens",
        ]),
        "{problem}": lambda: random.choice([
            "leaky faucet", "broken link", "formatting issue", "login bug",
            "missing label", "alignment problem", "slow query", "typo",
            "permission error", "routing issue", "display glitch", "crash",
        ]),
        "{location}": lambda: random.choice([
            "the kitchen", "the garage", "the office", "the living room",
            "the conference room", "the lobby", "the warehouse", "the patio",
            "the server room", "the front desk", "the storage closet",
            fake.city(), fake.city(),
        ]),
        "{event}": lambda: random.choice([
            "a team lunch", "the quarterly review", "a client meeting",
            "the offsite retreat", "a birthday party", "the annual picnic",
            "a training session", "the product demo", "a workshop",
            "the board meeting", "a dinner party", "the weekly standup",
        ]),
        "{skill}": lambda: random.choice([
            "woodworking", "Spanish", "piano", "photography", "calligraphy",
            "cooking", "watercolor painting", "pottery", "public speaking",
            "coding in Rust", "juggling", "meditation", "rock climbing",
        ]),
        "{tool}": lambda: random.choice([
            "Notion", "Obsidian", "Trello", "Slack", "Figma", "Linear",
            "Jira", "Asana", "Airtable", "Monday.com", "Basecamp",
            "the password manager", "1Password", "Google Docs",
        ]),
        "{purpose}": lambda: random.choice([
            "project management", "note taking", "team communication",
            "design work", "task tracking", "knowledge management",
        ]),
        "{system}": lambda: random.choice([
            "the CRM", "the database", "the website", "the app",
            "the backend", "the dashboard", "the API", "the server",
            "the billing system", "the inventory tracker", "the portal",
        ]),
        "{data}": lambda: random.choice([
            "the latest figures", "customer feedback", "the Q3 numbers",
            "the sales data", "pricing information", "user analytics",
            "the updated contacts", "performance metrics", "survey results",
        ]),
        "{department}": lambda: random.choice([
            "HR", "IT", "Finance", "Marketing", "Legal", "Operations",
            "Sales", "Engineering", "Customer Support", "Procurement",
        ]),
        "{thing}": lambda: random.choice([
            "a new laptop", "access credentials", "office supplies",
            "a parking pass", "a software license", "the budget approval",
            "travel reimbursement", "equipment upgrade", "training materials",
        ]),
        "{phone}": lambda: fake.phone_number(),
        "{number}": lambda: fake.bothify("####-####-####"),
        "{url}": lambda: fake.url(),
        "{time}": lambda: random.choice([
            "9 AM", "10 AM", "8:30 AM", "5 PM", "2 PM", "noon",
            "3 PM", "4:30 PM", "11 AM", "1 PM",
        ]),
        "{date}": lambda: random.choice([
            "Monday", "Tuesday", "next week", "Friday", "tomorrow",
            "March 15", "the 20th", "next Thursday", "this weekend",
        ]),
        "{percent}": lambda: f"{random.randint(1, 99)}%",
        "{amount}": lambda: f"${random.randint(10, 5000):,}",
        "{resource}": lambda: random.choice([
            "printer ink", "paper", "budget", "staff", "time",
            "server capacity", "storage space", "meeting rooms",
        ]),
        "{room}": lambda: random.choice([
            "kitchen", "bathroom", "bedroom", "living room", "garage",
            "office", "basement", "attic", "den", "guest room",
        ]),
        "{product}": lambda: random.choice([
            "the new feature", "version 2.0", "the mobile app",
            "the redesigned dashboard", "the API update", "the plugin",
        ]),
        "{platform}": lambda: random.choice([
            "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Vercel",
        ]),
        "{role}": lambda: fake.job(),
        "{field}": lambda: random.choice([
            "the status", "the address", "the contact info", "the price",
            "the description", "the due date", "the priority",
        ]),
        "{fixture}": lambda: random.choice([
            "leaky faucet", "broken doorknob", "squeaky hinge",
            "cracked tile", "loose shelf", "stuck window", "running toilet",
        ]),
        "{meal}": lambda: random.choice([
            "pasta", "stir fry", "soup", "tacos", "grilled chicken",
            "salad", "lasagna", "curry", "roast", "burgers",
        ]),
        "{space}": lambda: random.choice([
            "closet", "pantry", "bookshelf", "desk drawer", "filing cabinet",
            "garage shelves", "storage unit", "medicine cabinet",
        ]),
        "{supply}": lambda: random.choice([
            "paper towels", "coffee pods", "whiteboard markers",
            "sticky notes", "printer toner", "hand sanitizer", "snacks",
        ]),
        "{meeting}": lambda: random.choice([
            "Monday planning", "Friday wrap-up", "sprint review",
            "quarterly strategy", "client kickoff", "standup",
        ]),
        "{issue}": lambda: random.choice([
            "the billing error", "the shipping delay", "the warranty claim",
            "the account lockout", "the refund request", "the service outage",
        ]),
        "{project}": lambda: random.choice([
            "the website redesign", "the migration", "the product launch",
            "the hiring initiative", "the office move", "the annual report",
        ]),
        "{info}": lambda: random.choice([
            "the address", "the time", "the confirmation number",
            "the meeting link", "the directions", "the agenda",
        ]),
        "{feature}": lambda: random.choice([
            "the search feature", "dark mode", "notifications",
            "the export function", "user profiles", "the settings page",
        ]),
        "{environment}": lambda: random.choice([
            "production", "staging", "dev", "the test environment",
        ]),
        "{format}": lambda: random.choice([
            "CSV", "PDF", "Excel", "JSON", "a spreadsheet",
        ]),
        "{group}": lambda: random.choice([
            "the team", "the department", "the family", "the board",
            "the committee", "the volunteers", "the interns",
        ]),
        "{activity}": lambda: random.choice([
            "rock climbing", "surfing", "yoga", "martial arts",
            "gardening", "birdwatching", "sailing", "pottery",
        ]),
        "{idea}": lambda: random.choice([
            "a side business", "a blog", "a podcast", "a YouTube channel",
            "freelance consulting", "writing a book", "an online course",
        ]),
        "{outcome}": lambda: random.choice([
            "get approval", "finalize the budget", "complete the handoff",
            "resolve the issue", "ship the feature", "close the deal",
            "finish onboarding", "launch the campaign", "secure funding",
        ]),
        "{category}": lambda: random.choice([
            "Work", "Personal", "Health", "Finance", "Home", "Education",
            "Career", "Family", "Travel", "Fitness",
        ]),
        "{area}": lambda: random.choice([
            "marketing", "engineering", "customer success", "operations",
            "sales", "product", "design", "finance", "HR", "legal",
        ]),
    }

    result = template
    for placeholder, generator in replacements.items():
        while placeholder in result:
            result = result.replace(placeholder, generator(), 1)
    return result


# ===========================================================================
# COMPLETENESS GATE templates
# ===========================================================================

# "complete" = well-specified atoms across all 5 atom types
COMPLETENESS_COMPLETE_TEMPLATES = [
    # Tasks with clear outcome, action, timeframe, context
    "Call {person} at {phone} tomorrow at {time} to schedule the quarterly review",
    "Email {person} the final {document} by Friday so {department} can review it",
    "Buy {item} from {store} this weekend for the {room} renovation project",
    "Fix the {fixture} in {location} by {date} — call {company} if parts are needed",
    "Submit {document} to {person} in {department} by end of day for {topic} approval",
    "Schedule {event} with {person} for {date} at {time} in {location}",
    "Update {system} with {data} before the {meeting} meeting on {date}",
    "Print 20 copies of {document} on the office printer for tomorrow's {meeting}",
    "Research {topic} and send a summary to {person} by next Friday",
    "Deploy {product} to {platform} after {person} signs off on {document}",
    "Text {person} the {info} for the {event} on {date}",
    "Pick up {item} from {store} on the way home today for {person}",
    "Register for {event} before the {date} deadline — use the {company} discount code",
    "Back up {data} to {platform} by {date} per {department} policy",
    "Clean the {room} before {person} visits on {date}",
    "Order {item} from {store} for delivery by {date} — budget is {amount}",
    "Review {person}'s {document} and provide feedback by {date} for {project}",
    "Call {company} support at {phone} about {issue} — reference case {number}",
    "Confirm {event} logistics with {person} by {date} — need headcount and menu",
    "Set up {system} for the new {role} hire starting {date}",

    # Events with full details
    "Team lunch at {location} on {date} at noon — {person} organizing, {amount} budget",
    "Client meeting with {person} from {company} on {date} at {time} in {location}",
    "{event} scheduled for {date} at {time} — {person} presenting {topic}",
    "Doctor appointment on {date} at {time} at {location} for annual checkup",
    "Board meeting {date} at {time} — agenda: {topic}, attendees: {group}",

    # Facts with complete info
    "{person}'s phone number is {phone} — works at {company} as {role}",
    "Office WiFi password is {number} — updated {date}",
    "{company} support line: {phone}, hours {time} to {time}, reference account {number}",
    "The {system} admin credentials are in {tool} under {department} folder",
    "{department} Q3 budget is {amount} — approved by {person} on {date}",

    # Decisions with clear reasoning and timeline
    "Decision: Switch to {platform} for {purpose} by {date} — {person} leading migration",
    "Decided to hire {role} — post job listing by {date}, {person} will screen candidates",
    "Going with {company} for {thing} — contract signed, starts {date}",
    "Decision: Cancel {event} and reschedule for {date} — notify {group}",
    "Approved {amount} for {thing} — {person} to submit PO by {date}",

    # Insights with context
    "I notice I always procrastinate on {topic} when {person} isn't involved — schedule check-ins",
    "The {system} response time improves by {percent} when using {platform} — consider migrating",
    "Team velocity drops every time we skip {meeting} — make it mandatory for {group}",
    "Insight: {department} tasks take twice as long without {tool} — roll out by {date}",
    "{person} is most productive in the morning — schedule {topic} meetings before noon",
]

# "incomplete" = vague atoms missing key GTD info
COMPLETENESS_INCOMPLETE_TEMPLATES = [
    # Ultra-vague single words/phrases
    "dentist",
    "thing",
    "stuff",
    "meeting",
    "groceries",
    "that project",
    "something",
    "whatever",
    "the thing",
    "call",

    # Vague tasks
    "fix it",
    "fix the thing",
    "do the thing",
    "handle that",
    "deal with it",
    "look into it",
    "figure it out",
    "follow up",
    "check on that",
    "get back to them",
    "send that over",
    "update it",
    "finish up",
    "take care of it",
    "sort it out",
    "work on stuff",
    "do something about that problem",
    "make progress on the project",

    # Missing most details
    "need to do that project",
    "meeting about stuff",
    "email someone",
    "buy things",
    "go somewhere",
    "talk to people",
    "clean something",
    "fix a problem",
    "research a topic",
    "write a thing",
    "schedule something",
    "organize things",
    "prepare for that",
    "review something",
    "submit that",

    # Bare facts with no context
    "it costs money",
    "they said something",
    "someone mentioned it",
    "there's an issue",
    "something is broken",
    "numbers look off",
    "need to check",
    "might be wrong",
    "seems important",
    "should look at this",
]

# Enriched "complete" examples (with structured key:value enrichment format)
# These prevent re-triage infinite loops (Research Pitfall 5)
COMPLETENESS_ENRICHED_TEMPLATES = [
    "Call dentist\n---\nOutcome: Schedule annual cleaning\nDeadline: This week\nContext: Dr. {last_name}'s office at {phone}",
    "Fix the thing\n---\nOutcome: Repair the {fixture} in the {room}\nDeadline: By {date}\nContext: {person} reported it, tools in {location}",
    "Meeting about stuff\n---\nOutcome: Align on {topic} timeline\nDeadline: {date} at {time}\nContext: With {person} from {department}, in {location}",
    "Email someone\n---\nOutcome: Send {document} for approval\nDeadline: By {date}\nContext: {person} in {department} needs it for {project}",
    "Buy things\n---\nOutcome: Get {item} for the {room}\nDeadline: This weekend\nContext: {store}, budget {amount}",
    "Handle that\n---\nOutcome: Resolve {issue} with {company}\nDeadline: Before {date}\nContext: Reference {number}, contact {phone}",
    "Follow up\n---\nOutcome: Get status on {document} from {person}\nDeadline: By {date}\nContext: Last discussed at {meeting}, {department} needs it",
    "Do the project\n---\nOutcome: Complete {project} deliverables\nDeadline: {date}\nContext: {person} is lead, {group} involved, {tool} for tracking",
    "Check something\n---\nOutcome: Verify {data} accuracy in {system}\nDeadline: Before {meeting} on {date}\nContext: {person} flagged discrepancy",
    "Prepare for that\n---\nOutcome: Ready {document} for {event}\nDeadline: By {date} at {time}\nContext: {person} presenting, {group} attending",
]

COMPLETENESS_AMBIGUOUS = [
    ("Call {person} about {topic}", "incomplete"),
    ("Buy {item} soon", "incomplete"),
    ("{person} mentioned something about {topic}", "incomplete"),
    ("Need to deal with {fixture}", "incomplete"),
    ("Schedule a meeting", "incomplete"),
    ("Send the email", "incomplete"),
    ("Review {document}", "incomplete"),
    ("Talk to {person}", "incomplete"),
    ("Get {item}", "incomplete"),
    ("Clean the {room}", "incomplete"),
    ("Update {system}", "incomplete"),
    ("Research {topic}", "incomplete"),
    ("{problem} needs fixing", "incomplete"),
    ("Go to {store}", "incomplete"),
    ("Prepare for {event}", "incomplete"),
    # Some borderline "complete" (have enough context)
    ("Call {person} at {phone} about {topic} by {date}", "complete"),
    ("Buy {item} from {store} this weekend", "complete"),
    ("Email {document} to {person} by {date}", "complete"),
    ("Fix the {fixture} in the {room} — call {company}", "complete"),
    ("{person} works at {company} in {department}", "complete"),
]


# ===========================================================================
# MISSING-OUTCOME templates
# ===========================================================================
MISSING_OUTCOME_MISSING = [
    # No clear desired end state
    "Call {person}",
    "Email {person}",
    "Work on {topic}",
    "Look into {system}",
    "Deal with {problem}",
    "Talk to {person} about {topic}",
    "Schedule meeting with {person}",
    "Check {system}",
    "Review {document}",
    "Research {topic}",
    "Follow up with {person}",
    "Fix the {fixture}",
    "Go to {store}",
    "Update {system}",
    "Clean the {room}",
    "Organize {space}",
    "Prepare {document}",
    "Submit {document}",
    "Set up {tool}",
    "Handle {issue}",
    "Contact {department}",
    "Meet with {group}",
    "Process {data}",
    "Coordinate with {person}",
    "Write {document}",
]

MISSING_OUTCOME_NOT_MISSING = [
    # Explicit desired end states
    "Call {person} to get approval for {document}",
    "Email {person} to confirm {event} attendance",
    "Work on {topic} to finalize the proposal by {date}",
    "Look into {system} to diagnose the {problem}",
    "Talk to {person} to align on {topic} priorities",
    "Schedule meeting to decide on {topic} approach",
    "Review {document} to sign off on {amount} budget",
    "Research {topic} to recommend a vendor for {thing}",
    "Follow up with {person} to close the {topic} deal",
    "Fix the {fixture} so we can use the {room} again",
    "Clean the {room} before {person} visits on {date}",
    "Organize {space} to make room for {item}",
    "Prepare {document} for board approval on {date}",
    "Submit {document} to get {thing} reimbursed",
    "Set up {tool} so {group} can track {topic}",
    "Handle {issue} to prevent customer churn",
    "Contact {department} to get {thing} approved",
    "Meet with {group} to decide on the {topic} timeline",
    "Process {data} to generate the monthly {document}",
    "Write {document} to document {topic} for new hires",
    "Deploy {product} to reduce page load time by {percent}",
    "Call {company} to cancel the {thing} subscription",
    "Coordinate with {person} to hand off {project}",
    "Buy {item} to replace the broken one in the {room}",
    "Update {system} to reflect the new {data}",
]

MISSING_OUTCOME_AMBIGUOUS = [
    ("Help {person} with {topic}", "missing"),
    ("Work on the {problem}", "missing"),
    ("Send {person} {document}", "missing"),
    ("Get {person}'s input on {topic}", "not-missing"),
    ("Fix {problem} in {system}", "missing"),
    ("Discuss {topic} with {group}", "missing"),
    ("Finish {document} for {person}", "not-missing"),
    ("Resolve {issue}", "missing"),
    ("Complete the {topic} review", "not-missing"),
    ("Check on {fixture} situation", "missing"),
]


# ===========================================================================
# MISSING-NEXT-ACTION templates
# ===========================================================================
MISSING_NEXT_ACTION_MISSING = [
    # No concrete physical next step
    "The {fixture} needs attention",
    "{topic} is important",
    "We should think about {topic}",
    "Something needs to happen with {project}",
    "{person} needs help with {topic}",
    "The {system} situation",
    "Need to make progress on {topic}",
    "The {room} is a mess",
    "{issue} is still unresolved",
    "Would be good to address {topic}",
    "{person}'s {thing} request",
    "The {department} thing",
    "Should deal with {problem} at some point",
    "That {topic} project",
    "The {event} planning",
    "Something about {document} for {person}",
    "{topic} needs work",
    "The {system} upgrade",
    "{document} isn't right",
    "Need to figure out the {topic} strategy",
    "The {fixture} in the {room}",
    "{person} brought up {topic}",
    "Time to address {issue}",
    "Have to handle the {topic} situation",
    "Waiting on a decision about {topic}",
]

MISSING_NEXT_ACTION_NOT_MISSING = [
    # Verb-first concrete actions
    "Call {person} at {phone}",
    "Email {document} to {person}",
    "Walk to {store} and buy {item}",
    "Open {tool} and update {field}",
    "Drive to {location} and drop off {item}",
    "Print {document} on the office printer",
    "Draft a reply to {person}'s email",
    "Log into {system} and export {data}",
    "Text {person} the {info}",
    "Schedule a call with {person} for {date}",
    "Download {document} from {system}",
    "Post the update on {tool}",
    "Write the first draft of {document}",
    "Dial {company} support at {phone}",
    "Order {item} from {store} online",
    "Run the {data} report in {system}",
    "Send {person} a Slack message about {topic}",
    "Book the {location} for {date} at {time}",
    "Sign {document} and return to {person}",
    "File {document} in the {space}",
    "Configure {feature} in {system} settings",
    "Register on {url} for {event}",
    "Push the {product} deployment to {environment}",
    "Ask {person} for {document} at standup",
    "Review and approve {person}'s {document}",
]

MISSING_NEXT_ACTION_AMBIGUOUS = [
    ("Sort out {topic}", "missing"),
    ("Handle the {fixture}", "missing"),
    ("Get {item} for {person}", "not-missing"),
    ("Take care of {problem}", "missing"),
    ("Look at {document}", "not-missing"),
    ("Fix {problem}", "not-missing"),
    ("Address {issue}", "missing"),
    ("Check {system}", "not-missing"),
    ("Deal with {topic} thing", "missing"),
    ("Update the {document}", "not-missing"),
]


# ===========================================================================
# MISSING-TIMEFRAME templates
# ===========================================================================
MISSING_TIMEFRAME_MISSING = [
    # No temporal reference whatsoever
    "Call {person} about {topic}",
    "Buy {item} from {store}",
    "Email {person} the {document}",
    "Fix the {fixture} in the {room}",
    "Review {document}",
    "Schedule meeting with {person}",
    "Update {system} with {data}",
    "Clean the {room}",
    "Research {topic}",
    "Submit {document} to {department}",
    "Text {person} about {event}",
    "Pick up {item}",
    "Deploy {product} to {platform}",
    "Write {document} for {person}",
    "Organize {space}",
    "Contact {person} at {company}",
    "Set up {tool} for {group}",
    "Process the {data}",
    "Prepare {document}",
    "Handle {issue}",
    "Follow up with {person}",
    "Order {item}",
    "Talk to {person}",
    "Check {system} for issues",
    "Register for {event}",
]

MISSING_TIMEFRAME_NOT_MISSING = [
    # Clear temporal references
    "Call {person} tomorrow at {time}",
    "Buy {item} this weekend",
    "Email {person} the {document} by Friday",
    "Fix the {fixture} before {date}",
    "Review {document} by end of day",
    "Schedule meeting for {date} at {time}",
    "Update {system} before the {meeting} on {date}",
    "Clean the {room} this afternoon",
    "Research {topic} and report back next week",
    "Submit {document} by the {date} deadline",
    "Text {person} tonight about {event}",
    "Pick up {item} on the way home today",
    "Deploy {product} after hours on {date}",
    "Write {document} draft by {date}",
    "Organize {space} this Saturday morning",
    "Contact {person} first thing Monday",
    "Set up {tool} within the next two weeks",
    "Process {data} before quarterly close on {date}",
    "Prepare {document} 48 hours before {event}",
    "Handle {issue} ASAP — SLA expires {date}",
    "Follow up with {person} in 3 days",
    "Order {item} for delivery by {date}",
    "Talk to {person} at the {meeting} today",
    "Check {system} daily until {date}",
    "Register for {event} before early bird ends {date}",
]

MISSING_TIMEFRAME_AMBIGUOUS = [
    ("Call {person} soon", "missing"),
    ("Do {topic} when possible", "missing"),
    ("Buy {item} eventually", "missing"),
    ("Fix {fixture} as soon as we can", "missing"),
    ("Email {person} right away", "not-missing"),
    ("Schedule {event} for sometime next month", "not-missing"),
    ("Handle {issue} promptly", "missing"),
    ("Review {document} at some point", "missing"),
    ("Deploy {product} later today", "not-missing"),
    ("Order {item} in the coming weeks", "not-missing"),
]


# ===========================================================================
# MISSING-CONTEXT templates
# ===========================================================================
MISSING_CONTEXT_MISSING = [
    # No who/where/what-tool
    "Fix the problem",
    "Send the email",
    "Schedule the meeting",
    "Update the thing",
    "Review the doc",
    "Call about the issue",
    "Buy the stuff",
    "Prepare for the presentation",
    "Submit the form",
    "Handle the request",
    "Write the report",
    "Order supplies",
    "Set up the account",
    "Research options",
    "Follow up on that",
    "Check on the delivery",
    "Process the paperwork",
    "Clean the space",
    "Fix the code",
    "Deploy the update",
    "Get approval",
    "Make a reservation",
    "Book the room",
    "Organize the files",
    "File the documents",
]

MISSING_CONTEXT_NOT_MISSING = [
    # Has who/where/what-tool
    "Call {person} about {topic}",
    "Email {person} at {company} the {document}",
    "Fix the {problem} in {location} using {tool}",
    "Buy {item} from {store}",
    "Schedule meeting with {person} in the {location}",
    "Update {field} in {system} for {department}",
    "Review {document} with {person}",
    "Submit {document} to {person} at {department}",
    "Talk to {person} at their desk about {topic}",
    "Set up {tool} for {person}'s team",
    "Organize {space} in {location}",
    "File {document} in {tool}",
    "Clean the {room} with the supplies from {location}",
    "Deploy to {platform} using {tool}",
    "Process {data} in {system} for {department}",
    "Research {topic} on {tool}",
    "Follow up with {person} from {company}",
    "Pick up {item} at {store} near {location}",
    "Handle {issue} through {department}'s portal",
    "Write {document} in {tool} for {person}",
    "Order {item} through {company}'s {system}",
    "Prepare for {event} at {location} with {person}",
    "Check {system} dashboard at {url}",
    "Book the {location} for {group} on {tool}",
    "Get {person}'s sign-off on {document}",
]

MISSING_CONTEXT_AMBIGUOUS = [
    ("Fix the bug in the app", "missing"),
    ("Send it to the team", "missing"),
    ("Buy groceries at the store", "not-missing"),
    ("Talk to someone about it", "missing"),
    ("Update the spreadsheet", "missing"),
    ("Check the dashboard", "missing"),
    ("Organize the office closet", "not-missing"),
    ("Call the support line", "missing"),
    ("Email the proposal", "missing"),
    ("Meet in the conference room", "not-missing"),
]


# ===========================================================================
# MISSING-REFERENCE templates
# ===========================================================================
MISSING_REFERENCE_MISSING = [
    # No project/area/category link
    "Call {person}",
    "Buy {item}",
    "Fix the {fixture}",
    "Send an email",
    "Schedule a meeting",
    "Clean up",
    "Do some research",
    "Write a draft",
    "Review the numbers",
    "Prepare a presentation",
    "Submit the form",
    "Handle the issue",
    "Talk to someone",
    "Order some stuff",
    "Update the records",
    "Follow up on that call",
    "Make a decision",
    "Set up the new account",
    "Process the request",
    "Check the system",
    "Deploy the changes",
    "Get approval",
    "Organize the files",
    "Book a room",
    "File paperwork",
]

MISSING_REFERENCE_NOT_MISSING = [
    # Mentions projects, areas, categories
    "Call {person} about {project}",
    "Buy {item} for the {room} renovation project",
    "Fix {fixture} — part of the {location} maintenance backlog",
    "Email {person} re: {project} status update",
    "Schedule {topic} review for the {area} team",
    "Clean {room} as part of the spring cleaning project",
    "Research vendors for {project}",
    "Write the {area} quarterly report draft",
    "Review {data} for the {department} audit",
    "Prepare {event} presentation for {project}",
    "Submit {document} for {project} compliance",
    "Handle {issue} under the {area} support queue",
    "Talk to {person} about their role in {project}",
    "Order {item} — {category} budget line item",
    "Update {system} for the {project} migration",
    "Follow up on {project} deliverable with {person}",
    "Decision needed: {topic} for {project} Phase 2",
    "Set up {tool} for {project} tracking",
    "Process {data} for {area} monthly review",
    "Check {system} for {project} deployment status",
    "Deploy {feature} as part of {project}",
    "Get {person}'s approval for {project} budget of {amount}",
    "Organize {space} for the {department} team",
    "Book {location} for the {project} kickoff",
    "File {document} under {area} > {topic}",
]

MISSING_REFERENCE_AMBIGUOUS = [
    ("Work on the report", "missing"),
    ("Update the tracker", "missing"),
    ("Handle the client request", "not-missing"),
    ("Fix the thing for {person}", "missing"),
    ("Prepare for the annual event", "not-missing"),
    ("Schedule a team sync", "missing"),
    ("Review the budget numbers", "not-missing"),
    ("Write the newsletter", "not-missing"),
    ("Organize the drive folders", "missing"),
    ("Submit the expense report", "not-missing"),
]


# ===========================================================================
# Classifier config
# ===========================================================================
CLASSIFIERS = {
    "completeness": {
        "output_file": "clarification-completeness.jsonl",
        "label_positive": "complete",
        "label_negative": "incomplete",
    },
    "missing-outcome": {
        "output_file": "clarification-missing-outcome.jsonl",
        "label_positive": "not-missing",
        "label_negative": "missing",
    },
    "missing-next-action": {
        "output_file": "clarification-missing-next-action.jsonl",
        "label_positive": "not-missing",
        "label_negative": "missing",
    },
    "missing-timeframe": {
        "output_file": "clarification-missing-timeframe.jsonl",
        "label_positive": "not-missing",
        "label_negative": "missing",
    },
    "missing-context": {
        "output_file": "clarification-missing-context.jsonl",
        "label_positive": "not-missing",
        "label_negative": "missing",
    },
    "missing-reference": {
        "output_file": "clarification-missing-reference.jsonl",
        "label_positive": "not-missing",
        "label_negative": "missing",
    },
}

# Template data mapping
TEMPLATE_DATA = {
    "completeness": {
        "positive": COMPLETENESS_COMPLETE_TEMPLATES,
        "negative": COMPLETENESS_INCOMPLETE_TEMPLATES,
        "enriched": COMPLETENESS_ENRICHED_TEMPLATES,
        "ambiguous": COMPLETENESS_AMBIGUOUS,
    },
    "missing-outcome": {
        "positive": MISSING_OUTCOME_NOT_MISSING,
        "negative": MISSING_OUTCOME_MISSING,
        "ambiguous": MISSING_OUTCOME_AMBIGUOUS,
    },
    "missing-next-action": {
        "positive": MISSING_NEXT_ACTION_NOT_MISSING,
        "negative": MISSING_NEXT_ACTION_MISSING,
        "ambiguous": MISSING_NEXT_ACTION_AMBIGUOUS,
    },
    "missing-timeframe": {
        "positive": MISSING_TIMEFRAME_NOT_MISSING,
        "negative": MISSING_TIMEFRAME_MISSING,
        "ambiguous": MISSING_TIMEFRAME_AMBIGUOUS,
    },
    "missing-context": {
        "positive": MISSING_CONTEXT_NOT_MISSING,
        "negative": MISSING_CONTEXT_MISSING,
        "ambiguous": MISSING_CONTEXT_AMBIGUOUS,
    },
    "missing-reference": {
        "positive": MISSING_REFERENCE_NOT_MISSING,
        "negative": MISSING_REFERENCE_MISSING,
        "ambiguous": MISSING_REFERENCE_AMBIGUOUS,
    },
}


# ---------------------------------------------------------------------------
# Generation logic
# ---------------------------------------------------------------------------
def generate(classifier_name: str, count_per_label: int) -> int:
    """Generate training data for the specified classifier. Returns total count."""
    config = CLASSIFIERS[classifier_name]
    data = TEMPLATE_DATA[classifier_name]
    output_path = OUTPUT_DIR / config["output_file"]
    label_pos = config["label_positive"]
    label_neg = config["label_negative"]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    positive_templates = data["positive"]
    negative_templates = data["negative"]
    enriched_templates = data.get("enriched", [])
    ambiguous_list = data["ambiguous"]

    samples = []

    # Generate positive (well-specified / not-missing) samples
    for i in range(count_per_label):
        template = positive_templates[i % len(positive_templates)]
        text = fill_template(template)
        samples.append({"text": text, "label": label_pos})

    # Generate negative (incomplete / missing) samples
    for i in range(count_per_label):
        template = negative_templates[i % len(negative_templates)]
        text = fill_template(template)
        samples.append({"text": text, "label": label_neg})

    # Generate enriched "complete" examples for completeness gate
    if enriched_templates:
        enriched_count = min(200, count_per_label // 5)
        for i in range(enriched_count):
            template = enriched_templates[i % len(enriched_templates)]
            text = fill_template(template)
            samples.append({"text": text, "label": label_pos})

    # Generate ambiguous examples (~200 or 10% whichever is smaller)
    ambiguous_target = min(200, max(50, count_per_label // 5))
    for i in range(ambiguous_target):
        template, raw_label = ambiguous_list[i % len(ambiguous_list)]
        # Map ambiguous labels to positive/negative
        if raw_label in (label_pos, label_neg):
            label = raw_label
        elif raw_label == "missing":
            label = label_neg
        elif raw_label == "not-missing":
            label = label_pos
        elif raw_label == "complete":
            label = label_pos
        elif raw_label == "incomplete":
            label = label_neg
        else:
            label = raw_label
        text = fill_template(template)
        samples.append({"text": text, "label": label})

    # Shuffle
    random.shuffle(samples)

    # Write JSONL
    with open(output_path, "w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample) + "\n")

    # Statistics
    label_counts = {}
    for s in samples:
        label_counts[s["label"]] = label_counts.get(s["label"], 0) + 1

    print(f"\n=== {classifier_name} Statistics ===")
    print(f"Output: {output_path}")
    print(f"Total samples: {len(samples)}")
    for label in sorted(label_counts.keys()):
        count = label_counts[label]
        pct = count / len(samples) * 100
        print(f"  {label}: {count} ({pct:.1f}%)")

    ambiguous_total = len(samples) - (count_per_label * 2) - (len(enriched_templates) > 0 and min(200, count_per_label // 5) or 0)
    print(f"Ambiguous examples: ~{ambiguous_target}")

    # Sample preview
    print(f"\n=== Sample Preview (first 3) ===")
    for i, sample in enumerate(samples[:3]):
        text_preview = sample["text"][:100] + ("..." if len(sample["text"]) > 100 else "")
        print(f"  [{i}] ({sample['label']}) {text_preview}")

    return len(samples)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic clarification training data",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1600,
        help="Number of examples per label per classifier (default: 1600)",
    )
    args = parser.parse_args()

    if args.count < 10:
        print(f"[ERROR] --count must be at least 10, got {args.count}", file=sys.stderr)
        sys.exit(1)

    print(f"Count per label: {args.count}")
    print(f"Classifiers: {list(CLASSIFIERS.keys())}")

    grand_total = 0
    for name in CLASSIFIERS:
        total = generate(name, args.count)
        grand_total += total

    print(f"\n{'=' * 60}")
    print(f"ALL CLASSIFIERS COMPLETE")
    print(f"{'=' * 60}")
    print(f"Total examples across all files: {grand_total}")
    print(f"Files generated: {len(CLASSIFIERS)}")


if __name__ == "__main__":
    main()
