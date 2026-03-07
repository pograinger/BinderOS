"""
20_generate_gtd_data.py -- Synthetic GTD Classification Training Data Generator

Generates labeled classification training examples for four GTD classifiers
using Faker-generated entities embedded in template sentences.

Output: scripts/training-data/{classifier-name}.jsonl
        (one JSON object per line: {"text": "...", "label": "..."})

Classifiers:
    gtd-routing       4-way: next-action, waiting-for, someday-maybe, reference
    actionability     binary: actionable, non-actionable
    project-detection binary: project, single-action
    context-tagging   6-way: @computer, @phone, @errands, @home, @office, @agenda

Usage:
    python -u 20_generate_gtd_data.py --classifier gtd-routing --count 1000
    python -u 20_generate_gtd_data.py --classifier actionability --count 100

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
            "the draft", "the agenda", "the meeting notes",
        ]),
        "{item}": lambda: random.choice([
            "printer paper", "batteries", "coffee filters", "a new keyboard",
            "groceries", "light bulbs", "paint", "a gift card", "stamps",
            "envelopes", "cleaning supplies", "a phone charger", "notebooks",
            "a new monitor", "packing tape", "extension cord", "hand soap",
        ]),
        "{store}": lambda: random.choice([
            "Target", "Costco", "Home Depot", "Walmart", "Best Buy",
            "Staples", "Office Depot", "Trader Joe's", "CVS", "Walgreens",
            "the hardware store", "the grocery store", "Amazon", "IKEA",
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
            "time tracking", "file storage", "collaboration", "planning",
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
        "{summary}": lambda: random.choice([
            "approved the new process", "discussed timeline changes",
            "agreed to extend the deadline", "reviewed the Q2 results",
            "decided to proceed with option B", "postponed until next quarter",
            "no travel without pre-approval", "all expenses need receipts",
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
    }

    result = template
    for placeholder, generator in replacements.items():
        while placeholder in result:
            result = result.replace(placeholder, generator(), 1)
    return result


# ---------------------------------------------------------------------------
# GTD Routing templates (4-way)
# ---------------------------------------------------------------------------
GTD_ROUTING_TEMPLATES = {
    "next-action": [
        "Call {person} about {topic}",
        "Buy {item} from {store}",
        "Email {person} {document}",
        "Fix the {problem} in {location}",
        "Review {document} and send feedback",
        "Schedule {event} with {person}",
        "Update {system} with {data}",
        "Submit {document} to {person}",
        "Send {person} the final version of {document}",
        "Print {document} for the meeting",
        "Book {event} for {date}",
        "Reply to {person}'s email about {topic}",
        "Draft {document} for {person}",
        "Pay {amount} for {item}",
        "Pick up {item} from {store}",
        "Clean {room} before {date}",
        "Register for {event}",
        "Back up {data} on {system}",
        "Research {topic} and summarize findings",
        "Text {person} about {event}",
        "Order {item} online",
        "File {document} in {system}",
        "Set up {system} for the new {role}",
        "Confirm {event} with {person}",
        "Download {document} from {system}",
    ],
    "waiting-for": [
        "Waiting for {person} to send {document}",
        "{person} will get back to me about {topic}",
        "Order placed for {item}, tracking {number}",
        "Submitted request to {department} for {thing}",
        "{person} is reviewing {document}",
        "Package from {company} arriving {date}",
        "{person} promised to finish {document} by {date}",
        "Sent {document} to {person}, awaiting response",
        "Asked {person} to look into {topic}",
        "{department} processing my request for {thing}",
        "Waiting on approval from {person} for {document}",
        "{person} checking with {department} about {topic}",
        "Contractor scheduled to fix {fixture} on {date}",
        "Insurance claim submitted, ref {number}",
        "{person} said they'd call me back about {topic}",
        "Delegated {document} to {person}",
        "Expecting delivery of {item} by {date}",
        "{person} owes me {document} by end of week",
        "Repair technician coming {date} for {fixture}",
        "Application submitted to {company}, awaiting response",
        "Refund pending from {company} for {item}",
        "{person} to follow up with {department} about {thing}",
        "Quote requested from {company} for {thing}",
        "Lab results expected {date}",
        "Waiting on {person} to confirm {event}",
    ],
    "someday-maybe": [
        "Maybe learn {skill} someday",
        "Consider switching to {tool} for {purpose}",
        "Would be nice to visit {location}",
        "Look into {topic} when there's time",
        "Might want to try {activity}",
        "Think about {idea} for the future",
        "Someday take a class on {skill}",
        "Could be worth exploring {tool}",
        "Interested in eventually learning {skill}",
        "Maybe start {idea} next year",
        "Would love to travel to {location} one day",
        "Consider volunteering for {group}",
        "Perhaps read more about {topic}",
        "Idea: {idea}",
        "Dream trip to {location}",
        "Might be fun to try {activity} with {person}",
        "One day I'd like to get into {skill}",
        "Possibly look into {tool} as an alternative",
        "If time permits, explore {topic}",
        "Long-term goal: learn {skill}",
        "Bucket list: visit {location}",
        "Eventually want to try {activity}",
        "Not urgent but interesting: {topic}",
        "Aspirational: build {idea}",
        "Future consideration: switch to {platform}",
    ],
    "reference": [
        "{person}'s phone number is {phone}",
        "The {system} password is stored in {tool}",
        "Office hours are {time} to {time}",
        "{topic} documentation is at {url}",
        "Company policy on {topic}: {summary}",
        "Meeting notes from {date}: {summary}",
        "{person} works at {company}",
        "The {department} budget is {amount}",
        "Server address: {url}",
        "{person}'s title is {role}",
        "Account number for {company}: {number}",
        "The {event} is scheduled for {date}",
        "WiFi password: {number}",
        "{person}'s birthday is {date}",
        "Emergency contact: {person} at {phone}",
        "The {system} runs on {platform}",
        "{company} support line: {phone}",
        "Building access code: {number}",
        "{department} head is {person}",
        "Current subscription: {tool} at {amount}/month",
        "Insurance policy number: {number}",
        "Parking spot assigned: {number}",
        "{person} is on the {group} committee",
        "Vendor contact: {person} at {company}",
        "Tax ID: {number}",
    ],
}

# Ambiguous borderline examples for GTD routing (15-20%)
GTD_ROUTING_AMBIGUOUS = [
    ("Maybe call {person} next week", "someday-maybe"),
    ("The {fixture} is broken", "reference"),
    ("{person} mentioned they'd send {document}", "waiting-for"),
    ("Should probably get {item} at some point", "someday-maybe"),
    ("Need to think about {topic}", "someday-maybe"),
    ("{person} might have {document} ready soon", "waiting-for"),
    ("{item} is running low", "reference"),
    ("It would be good to follow up with {person}", "next-action"),
    ("Not sure if I should pursue {idea}", "someday-maybe"),
    ("{person} was going to handle {topic}", "waiting-for"),
    ("Heard that {topic} is changing", "reference"),
    ("Probably should update {document} soon", "next-action"),
    ("Been meaning to organize {space}", "someday-maybe"),
    ("{company} said they would get back to me", "waiting-for"),
    ("The {event} details haven't been finalized", "reference"),
]


# ---------------------------------------------------------------------------
# Actionability templates (binary)
# ---------------------------------------------------------------------------
ACTIONABILITY_TEMPLATES = {
    "actionable": [
        "Call {person}",
        "Buy {item}",
        "Send {document} to {person}",
        "Fix {problem}",
        "Schedule {event}",
        "Write {document}",
        "Clean {room}",
        "Pay {amount} for {thing}",
        "Email {person} about {topic}",
        "Pick up {item} from {store}",
        "Book {event} for {date}",
        "Print {document}",
        "Reply to {person}'s message",
        "Set up {system}",
        "Order {item} from {store}",
        "Review {document}",
        "Update {field} in {system}",
        "Register for {event}",
        "Back up {data}",
        "Submit {document} to {department}",
        "Text {person} {info}",
        "Download {document} from {system}",
        "Return {item} to {store}",
        "File {document}",
        "Confirm {event} with {person}",
    ],
    "non-actionable": [
        "{person}'s birthday is {date}",
        "The meeting was productive",
        "Revenue was up {percent}",
        "The new policy takes effect {date}",
        "{topic} is interesting",
        "Server uptime: {percent}",
        "{person} works at {company}",
        "The {event} was a success",
        "Current balance: {amount}",
        "{department} budget was approved",
        "The office will be closed {date}",
        "{person} joined the {group} team",
        "Last quarter's results were strong",
        "The {system} update is available",
        "Average response time: {time}",
        "Company founded in {date}",
        "{person} is the new {role}",
        "The {event} had {percent} attendance",
        "Inventory is at {percent} capacity",
        "The {tool} license expires {date}",
        "Team size: {percent} of target",
        "{company} is based in {location}",
        "The project is on track",
        "{document} was published {date}",
        "Industry average is {percent}",
    ],
}

ACTIONABILITY_AMBIGUOUS = [
    ("{item} is broken", "non-actionable"),
    ("Need more {resource}", "non-actionable"),
    ("{person} mentioned {topic}", "non-actionable"),
    ("The {fixture} needs attention", "actionable"),
    ("Running low on {item}", "actionable"),
    ("{person} asked about {topic}", "actionable"),
    ("The {room} could use some work", "non-actionable"),
    ("Time to think about {topic}", "non-actionable"),
    ("{document} is outdated", "actionable"),
    ("{system} seems slow lately", "non-actionable"),
]


# ---------------------------------------------------------------------------
# Project Detection templates (binary)
# ---------------------------------------------------------------------------
PROJECT_DETECTION_TEMPLATES = {
    "project": [
        "Plan the {event}",
        "Organize {event} for {group}",
        "Renovate the {room}",
        "Launch {product}",
        "Migrate {system} to {platform}",
        "Hire a new {role}",
        "Set up {system} for the team",
        "Redesign {system}",
        "Implement {feature}",
        "Onboard {person} to the team",
        "Move to a new {location}",
        "Write and publish {document}",
        "Create a training program for {group}",
        "Build {idea}",
        "Prepare for the {event}",
        "Overhaul the {system}",
        "Coordinate {event} across {group}",
        "Develop a strategy for {topic}",
        "Remodel the {room}",
        "Set up the new {location} office",
        "Complete the {topic} certification",
        "Plan a trip to {location}",
        "Establish a process for {topic}",
        "Research and select a new {tool}",
        "Deploy {product} to {platform}",
    ],
    "single-action": [
        "Call {person}",
        "Buy {item}",
        "Send {document} to {person}",
        "Book {event} for {date}",
        "Print {document}",
        "Update {field} in {system}",
        "Reply to {person}'s email",
        "Pay {amount} for {item}",
        "Pick up {item} from {store}",
        "Drop off {item} at {location}",
        "Text {person} {info}",
        "Email {person} {document}",
        "Download {document}",
        "Sign {document}",
        "Approve {document}",
        "Schedule a call with {person}",
        "Order {item} online",
        "Return {item} to {store}",
        "Check {system} for updates",
        "File {document} in {system}",
        "Water the plants",
        "Take out the trash",
        "Charge the {item}",
        "Lock the {room}",
        "Refill {supply}",
    ],
}

PROJECT_DETECTION_AMBIGUOUS = [
    ("Research {topic}", "single-action"),
    ("Clean the {room}", "single-action"),
    ("Update {document}", "single-action"),
    ("Look into {tool}", "single-action"),
    ("Improve the {system}", "project"),
    ("Deal with the {problem}", "project"),
    ("Get the {room} ready", "project"),
    ("Sort out {topic}", "project"),
    ("Handle {topic} for {person}", "project"),
    ("Take care of the {fixture}", "single-action"),
]


# ---------------------------------------------------------------------------
# Context Tagging templates (6-way)
# ---------------------------------------------------------------------------
CONTEXT_TAGGING_TEMPLATES = {
    "@computer": [
        "Update {document} in {tool}",
        "Deploy {system} to {environment}",
        "Write code for {feature}",
        "Review pull request from {person}",
        "Research {topic} online",
        "Export {data} to {format}",
        "Send email to {person} about {topic}",
        "Update the spreadsheet with {data}",
        "Create a presentation for {event}",
        "Debug the {problem} in {system}",
        "Write a blog post about {topic}",
        "Back up files to {platform}",
        "Run the report in {system}",
        "Edit the photo for {document}",
        "Set up automation in {tool}",
        "Update the project board in {tool}",
        "Draft {document} in {tool}",
        "Process expenses in {system}",
        "Configure {system} settings",
        "Analyze {data} in {tool}",
    ],
    "@phone": [
        "Call {person} about {topic}",
        "Text {person} {info}",
        "Leave voicemail for {person}",
        "Dial into the {meeting} conference call",
        "Call {company} support about {issue}",
        "Phone {person} to confirm {event}",
        "Ring {department} about {thing}",
        "Call back {person} about {document}",
        "Text {person} the {info}",
        "Leave a message for {person} at {company}",
        "Call the doctor to schedule an appointment",
        "Phone the landlord about {fixture}",
        "Call {store} to check if {item} is in stock",
        "Dial {person} to discuss {topic}",
        "Call {company} billing department",
        "Text {person} the meeting time",
        "Call to make a reservation for {event}",
        "Phone {person} for a quick update",
        "Call insurance company about {issue}",
        "Ring {person} to coordinate {event}",
    ],
    "@errands": [
        "Pick up {item} from {store}",
        "Drop off {item} at {location}",
        "Return {item} to {store}",
        "Go to {location} for {purpose}",
        "Mail {item} at the post office",
        "Get {item} from the pharmacy",
        "Buy {item} at {store}",
        "Swing by {store} for {item}",
        "Take {item} to the dry cleaner",
        "Stop by the bank to deposit check",
        "Pick up the prescription at {store}",
        "Drop off donation at {location}",
        "Get keys copied at {store}",
        "Return library books",
        "Go to the DMV to renew registration",
        "Swing by {location} to pick up {item}",
        "Take the car for an oil change",
        "Drop off the package at {location}",
        "Pick up flowers from the florist",
        "Stop at {store} on the way home",
    ],
    "@home": [
        "Clean the {room}",
        "Fix the {fixture}",
        "Mow the lawn",
        "Cook {meal} for dinner",
        "Organize the {space}",
        "Water the plants",
        "Do laundry",
        "Vacuum the {room}",
        "Take out the trash",
        "Change the air filter",
        "Declutter the {space}",
        "Replace the {fixture}",
        "Wash the dishes",
        "Sweep the {room}",
        "Sort the recycling",
        "Tidy up the {room}",
        "Deep clean the {room}",
        "Rearrange furniture in {room}",
        "Hang the new curtains",
        "Paint the {room}",
    ],
    "@office": [
        "Set up the {room} for the meeting",
        "Print {document} on the office printer",
        "Restock the {supply}",
        "Check the mail in the office mailbox",
        "Talk to {person} at their desk",
        "Reserve the conference room for {event}",
        "Grab {supply} from the supply closet",
        "Post the {document} on the bulletin board",
        "Adjust the thermostat in the office",
        "Set up the projector for {event}",
        "Refill the coffee machine",
        "Drop off {document} at {person}'s desk",
        "Pick up the printed {document}",
        "Water the office plants",
        "Organize the shared kitchen",
        "Label the {supply} in the storage room",
        "Stock the break room with {supply}",
        "Clean the whiteboard after {meeting}",
        "Put up signs for {event}",
        "Distribute {document} to the team",
    ],
    "@agenda": [
        "Talk to {person} about {topic}",
        "Ask {person} for input on {project}",
        "Discuss {topic} with {person} at next 1:1",
        "Bring up {topic} with {person}",
        "Get {person}'s approval on {document}",
        "Ask {person} about {event}",
        "Mention {topic} to {person} at standup",
        "Check with {person} on {document} status",
        "Run {idea} by {person}",
        "Get {person}'s take on {topic}",
        "Follow up with {person} on {project}",
        "Raise {topic} with {person} in our next meeting",
        "Sync with {person} about {topic}",
        "Propose {idea} to {person}",
        "Share {data} with {person} for feedback",
        "Ask {person} to prioritize {topic}",
        "Confirm {event} details with {person}",
        "Coordinate with {person} on {project}",
        "Update {person} on {topic} progress",
        "Get sign-off from {person} on {document}",
    ],
}

CONTEXT_TAGGING_AMBIGUOUS = [
    ("Check {system} for {data}", "@computer"),
    ("Follow up on {topic} with {person}", "@agenda"),
    ("Get {item} for the office", "@errands"),
    ("Organize {space} at work", "@office"),
    ("Look up {topic}", "@computer"),
    ("Send {person} a quick message about {topic}", "@computer"),
    ("Set up {system} in the {room}", "@home"),
    ("Order {item} for the team", "@computer"),
    ("Check on {fixture} status", "@home"),
    ("Prepare {document} for {person}", "@computer"),
    ("Grab {item} on the way to work", "@errands"),
    ("Catch up with {person}", "@agenda"),
]


# ---------------------------------------------------------------------------
# Classifier config
# ---------------------------------------------------------------------------
CLASSIFIERS = {
    "gtd-routing": {
        "templates": GTD_ROUTING_TEMPLATES,
        "ambiguous": GTD_ROUTING_AMBIGUOUS,
        "output_file": "gtd-routing.jsonl",
    },
    "actionability": {
        "templates": ACTIONABILITY_TEMPLATES,
        "ambiguous": ACTIONABILITY_AMBIGUOUS,
        "output_file": "actionability.jsonl",
    },
    "project-detection": {
        "templates": PROJECT_DETECTION_TEMPLATES,
        "ambiguous": PROJECT_DETECTION_AMBIGUOUS,
        "output_file": "project-detection.jsonl",
    },
    "context-tagging": {
        "templates": CONTEXT_TAGGING_TEMPLATES,
        "ambiguous": CONTEXT_TAGGING_AMBIGUOUS,
        "output_file": "context-tagging.jsonl",
    },
}


# ---------------------------------------------------------------------------
# Generation logic
# ---------------------------------------------------------------------------
def generate(classifier_name: str, count_per_label: int) -> None:
    """Generate training data for the specified classifier."""
    config = CLASSIFIERS[classifier_name]
    templates = config["templates"]
    ambiguous = config["ambiguous"]
    output_path = OUTPUT_DIR / config["output_file"]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    labels = list(templates.keys())
    num_labels = len(labels)

    # Calculate ambiguous count (15-20% of total)
    total_regular = count_per_label * num_labels
    ambiguous_ratio = 0.17  # ~17% ambiguous
    ambiguous_count_target = int(total_regular * ambiguous_ratio / (1 - ambiguous_ratio))

    samples = []

    # Generate regular samples
    for label in labels:
        label_templates = templates[label]
        for i in range(count_per_label):
            template = label_templates[i % len(label_templates)]
            text = fill_template(template)
            samples.append({"text": text, "label": label})

    # Generate ambiguous samples
    for i in range(ambiguous_count_target):
        template, label = ambiguous[i % len(ambiguous)]
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
    print(f"Labels ({num_labels}):")
    for label in labels:
        count = label_counts.get(label, 0)
        pct = count / len(samples) * 100
        print(f"  {label}: {count} ({pct:.1f}%)")
    ambiguous_total = len(samples) - total_regular
    print(f"Ambiguous examples: {ambiguous_total} ({ambiguous_total / len(samples) * 100:.1f}%)")

    # Sample preview
    print(f"\n=== Sample Preview (first 5) ===")
    for i, sample in enumerate(samples[:5]):
        print(f"  [{i}] ({sample['label']}) {sample['text']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic GTD classification training data",
    )
    parser.add_argument(
        "--classifier",
        choices=list(CLASSIFIERS.keys()),
        required=True,
        help="Which classifier to generate data for",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1000,
        help="Number of examples per label (default: 1000)",
    )
    args = parser.parse_args()

    if args.count < 10:
        print(f"[ERROR] --count must be at least 10, got {args.count}", file=sys.stderr)
        sys.exit(1)

    print(f"Classifier: {args.classifier}")
    print(f"Count per label: {args.count}")

    generate(args.classifier, args.count)


if __name__ == "__main__":
    main()
