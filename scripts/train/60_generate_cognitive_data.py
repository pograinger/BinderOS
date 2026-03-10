"""
60_generate_cognitive_data.py -- Generate training data for cognitive model army.

Generates labeled classification training examples for 10 cognitive dimension
classifiers using Faker-generated entities embedded in template sentences.

Output: scripts/training-data/{model-id}.jsonl
        (one JSON object per line: {"text": "...", "label": "..."})

Models:
    priority-matrix       4-way: Eisenhower quadrants
    energy-level          3-way: high-focus, medium-focus, low-energy
    time-estimate         4-way: quick, short, medium, long
    gtd-horizon           5-way: runway to vision
    knowledge-domain      8-way: life areas
    emotional-valence     4-way: positive, neutral, negative, anxious
    collaboration-type    3-way: solo, delegation, collaboration
    information-lifecycle 4-way: ephemeral to permanent
    review-cadence        4-way: daily to quarterly
    cognitive-load        4-way: trivial to deep

Usage:
    python -u 60_generate_cognitive_data.py --model priority-matrix --count 400
    python -u 60_generate_cognitive_data.py --model all --count 400

Note: Use -u flag to avoid Python output buffering issues.
"""

import argparse
import json
import random
import sys
from pathlib import Path

from faker import Faker

from signal_protocol import COGNITIVE_MODELS, get_all_model_ids

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_DIR = REPO_ROOT / "scripts" / "training-data"

# ---------------------------------------------------------------------------
# Faker setup (same seed as 20_generate_gtd_data.py for consistency)
# ---------------------------------------------------------------------------
fake = Faker("en_US")
Faker.seed(42)
random.seed(42)


# ---------------------------------------------------------------------------
# Shared fill_template (same as 20_generate_gtd_data.py)
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
            "Staples", "Trader Joe's", "CVS", "the hardware store",
        ]),
        "{problem}": lambda: random.choice([
            "leaky faucet", "broken link", "formatting issue", "login bug",
            "missing label", "alignment problem", "slow query", "typo",
            "permission error", "routing issue", "display glitch",
        ]),
        "{location}": lambda: random.choice([
            "the kitchen", "the garage", "the office", "the living room",
            "the conference room", "the warehouse", "the patio",
            fake.city(), fake.city(),
        ]),
        "{event}": lambda: random.choice([
            "a team lunch", "the quarterly review", "a client meeting",
            "the offsite retreat", "a birthday party", "the annual picnic",
            "a training session", "the product demo", "a workshop",
        ]),
        "{skill}": lambda: random.choice([
            "woodworking", "Spanish", "piano", "photography", "calligraphy",
            "cooking", "watercolor painting", "pottery", "public speaking",
        ]),
        "{tool}": lambda: random.choice([
            "Notion", "Obsidian", "Trello", "Slack", "Figma", "Linear",
            "Jira", "Google Docs", "1Password",
        ]),
        "{system}": lambda: random.choice([
            "the CRM", "the database", "the website", "the app",
            "the backend", "the dashboard", "the API", "the server",
        ]),
        "{data}": lambda: random.choice([
            "the latest figures", "customer feedback", "the Q3 numbers",
            "the sales data", "pricing information", "user analytics",
        ]),
        "{department}": lambda: random.choice([
            "HR", "IT", "Finance", "Marketing", "Legal", "Operations",
            "Sales", "Engineering", "Customer Support",
        ]),
        "{phone}": lambda: fake.phone_number(),
        "{number}": lambda: fake.bothify("####-####-####"),
        "{url}": lambda: fake.url(),
        "{time}": lambda: random.choice([
            "9 AM", "10 AM", "8:30 AM", "5 PM", "2 PM", "noon", "3 PM",
        ]),
        "{date}": lambda: random.choice([
            "Monday", "Tuesday", "next week", "Friday", "tomorrow",
            "March 15", "the 20th", "next Thursday", "this weekend",
        ]),
        "{amount}": lambda: f"${random.randint(10, 5000):,}",
        "{room}": lambda: random.choice([
            "kitchen", "bathroom", "bedroom", "living room", "garage",
            "office", "basement", "attic", "guest room",
        ]),
        "{fixture}": lambda: random.choice([
            "leaky faucet", "broken doorknob", "squeaky hinge",
            "cracked tile", "loose shelf", "stuck window", "running toilet",
        ]),
        "{meal}": lambda: random.choice([
            "pasta", "stir fry", "soup", "tacos", "grilled chicken",
            "salad", "lasagna", "curry",
        ]),
        "{supply}": lambda: random.choice([
            "paper towels", "coffee pods", "whiteboard markers",
            "sticky notes", "printer toner", "hand sanitizer",
        ]),
        "{project}": lambda: random.choice([
            "the website redesign", "the migration", "the product launch",
            "the hiring initiative", "the office move", "the annual report",
        ]),
        "{feature}": lambda: random.choice([
            "the search feature", "dark mode", "notifications",
            "the export function", "user profiles", "the settings page",
        ]),
        "{platform}": lambda: random.choice([
            "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Vercel",
        ]),
        "{role}": lambda: fake.job(),
        "{idea}": lambda: random.choice([
            "a side business", "a blog", "a podcast", "a YouTube channel",
            "freelance consulting", "writing a book", "an online course",
        ]),
        "{exercise}": lambda: random.choice([
            "running", "yoga", "weight lifting", "swimming", "cycling",
            "pilates", "hiking", "stretching", "CrossFit",
        ]),
        "{doctor}": lambda: random.choice([
            "the dentist", "the dermatologist", "the optometrist",
            "the primary care doctor", "the therapist", "the chiropractor",
        ]),
        "{medication}": lambda: random.choice([
            "vitamins", "allergy meds", "prescription refill",
            "supplements", "eye drops", "pain reliever",
        ]),
        "{bill}": lambda: random.choice([
            "rent", "electricity", "internet", "car insurance",
            "phone bill", "gym membership", "streaming subscription",
        ]),
        "{instrument}": lambda: random.choice([
            "guitar", "piano", "drums", "violin", "ukulele", "synthesizer",
        ]),
        "{art_form}": lambda: random.choice([
            "watercolor", "acrylic painting", "digital art", "sketching",
            "sculpture", "photography", "collage", "printmaking",
        ]),
        "{friend}": lambda: fake.first_name(),
        "{group}": lambda: random.choice([
            "the team", "the family", "the book club", "the neighbors",
            "the volunteers", "the committee", "the alumni group",
        ]),
    }

    result = template
    for placeholder, generator in replacements.items():
        while placeholder in result:
            result = result.replace(placeholder, generator(), 1)
    return result


# ===========================================================================
# TEMPLATE DEFINITIONS FOR ALL 10 COGNITIVE MODELS
# ===========================================================================

# ---------------------------------------------------------------------------
# 1. Priority Matrix (Eisenhower)
# ---------------------------------------------------------------------------
PRIORITY_MATRIX_TEMPLATES = {
    "urgent-important": [
        "Client deadline tomorrow -- finish {document} tonight",
        "Server is down in production, fix the {problem} immediately",
        "Tax filing due today, submit {document} now",
        "Emergency meeting with {person} about {topic} in 30 minutes",
        "Critical bug blocking users -- fix {problem} ASAP",
        "{person} needs {document} by end of day or we lose the deal",
        "Deadline extended only until {date} -- must finish {project}",
        "Insurance claim expires tomorrow, call {company} now",
        "Child's school called -- pick up from school immediately",
        "Water leak in {room} -- call plumber right now",
        "Contract must be signed by {person} before {date}",
        "Board presentation is {date} and slides aren't ready",
        "Medical test results came in -- schedule follow-up today",
        "Payment of {amount} overdue -- pay before late fee",
        "Flight leaves tomorrow and haven't packed yet",
        "Fire alarm inspection is today, prepare {location}",
        "Customer escalation from {person} -- respond within the hour",
        "Code freeze is tonight, merge {feature} now",
        "Investor meeting in 2 hours, review {document} immediately",
        "Pipe burst in {room}, call emergency plumber",
    ],
    "urgent-not-important": [
        "Reply to {person}'s non-critical email they keep asking about",
        "Someone needs the WiFi password -- it's in {tool}",
        "{person} wants to know when the next {event} is",
        "HR needs you to fill out the annual survey by today",
        "Office supply order due -- add {item} to the list",
        "Expense report needs to be filed by end of week",
        "Calendar invite from {person} for a meeting I don't need to attend",
        "IT asking everyone to restart their laptops today",
        "Receptionist asking who's coming to {event}",
        "Kitchen fridge needs cleaning, it's {person}'s birthday cake day",
        "{person} pinged me on Slack asking about {topic} -- not my area",
        "Newsletter from {company} needs unsubscribing",
        "Browser notification: {tool} subscription renewing today",
        "Coworker wants lunch recommendation urgently",
        "Phone buzzing with group chat about {event} planning",
        "RSVP deadline for {event} is today -- don't really want to go",
        "Junk mail piling up -- sort through today",
        "Reminder: office lottery pool collection by 3 PM",
        "{person} needs a headcount for {event} by tonight",
        "Parking pass renewal form due this week",
    ],
    "not-urgent-important": [
        "Start working on the 5-year career development plan",
        "Schedule annual physical with {doctor}",
        "Review and update the family emergency plan",
        "Build a monthly budget and stick to it",
        "Set up automated savings for retirement fund",
        "Plan the architecture for {project}",
        "Write the strategic roadmap for next year",
        "Research life insurance options",
        "Start exercising regularly -- try {exercise}",
        "Learn {skill} to grow professionally",
        "Have a meaningful conversation with {person} about our relationship",
        "Create a will and estate plan",
        "Build an emergency fund with 6 months of expenses",
        "Read that leadership book {person} recommended",
        "Mentor {person} -- schedule regular 1:1s",
        "Improve diet -- plan healthy meals for the week",
        "Set up regular date nights with partner",
        "Develop a personal knowledge management system",
        "Write down life goals and review quarterly",
        "Research schools for the kids' next year",
    ],
    "not-urgent-not-important": [
        "Reorganize the junk drawer in the {room}",
        "Browse social media for interesting articles",
        "Watch that show everyone's been talking about",
        "Organize old photos on the phone",
        "Clean out the email promotions folder",
        "Rearrange apps on the home screen",
        "Check what's new on the {tool} changelog",
        "Compare prices of {item} across stores",
        "Read random articles about {topic}",
        "Scroll through {person}'s vacation photos",
        "Sort bookmarks in the browser",
        "Customize the desktop wallpaper",
        "Look up trivia about {topic}",
        "Window shop online for {item}",
        "Rewatch old favorites on streaming",
        "Reorganize the spice rack",
        "Check trending topics on social media",
        "Browse deals on {store} website",
        "Play with settings in {tool}",
        "Color-code the calendar for fun",
    ],
}

PRIORITY_MATRIX_AMBIGUOUS = [
    ("Should probably review {document} sometime", "not-urgent-important"),
    ("{person} texted about {topic}, not sure if it's urgent", "urgent-not-important"),
    ("The {fixture} is getting worse", "not-urgent-important"),
    ("Need to clean up the {room} eventually", "not-urgent-not-important"),
    ("Might want to update {document} before the meeting", "urgent-important"),
    ("Thinking about starting {exercise}", "not-urgent-important"),
    ("{person} asked if I could help with {topic}", "urgent-not-important"),
    ("That article about {topic} looked interesting", "not-urgent-not-important"),
    ("Bills are starting to pile up", "urgent-important"),
    ("Wonder if {tool} has a new version", "not-urgent-not-important"),
]

# ---------------------------------------------------------------------------
# 2. Energy Level
# ---------------------------------------------------------------------------
ENERGY_LEVEL_TEMPLATES = {
    "high-focus": [
        "Write the architecture document for {project}",
        "Debug the complex {problem} in {system}",
        "Design the new user flow for {feature}",
        "Write a detailed proposal for {topic}",
        "Analyze the root cause of the {problem}",
        "Code review for {person}'s complex pull request",
        "Strategic planning session for {topic}",
        "Write the annual performance self-assessment",
        "Compose a difficult email to {person} about {topic}",
        "Research and evaluate {tool} alternatives",
        "Create a financial model for {project}",
        "Draft the legal response regarding {topic}",
        "Solve the optimization problem in {system}",
        "Write chapter 3 of the book",
        "Design the database schema for {feature}",
        "Prepare the board presentation on {topic}",
        "Negotiate terms with {company} on {topic}",
        "Build the data pipeline for {system}",
        "Write a complex SQL query to analyze {data}",
        "Create the test strategy for {project}",
    ],
    "medium-focus": [
        "Reply to {person}'s email about {topic}",
        "Update the project status in {tool}",
        "Review {person}'s draft of {document}",
        "Schedule meetings for next week",
        "Update the team on {topic} at standup",
        "Organize notes from the {event}",
        "Fill out the expense report",
        "Prepare agenda for meeting with {person}",
        "Send {document} to {department} for review",
        "Follow up with {person} about {topic}",
        "Update {data} in {system}",
        "Coordinate with {person} on {event} logistics",
        "Process inbox and file emails",
        "Write meeting summary and action items",
        "Review and approve {person}'s time off request",
        "Update the shared spreadsheet with {data}",
        "Order {item} for the office",
        "Set up the recurring meeting in {tool}",
        "Proofread {document} before sending",
        "Respond to {person}'s Slack messages",
    ],
    "low-energy": [
        "File {document} in the shared drive",
        "Delete old emails from inbox",
        "Rename files to follow naming convention",
        "Print {document}",
        "Take out the trash",
        "Water the plants",
        "Sharpen pencils",
        "Refill the stapler",
        "Archive completed tasks in {tool}",
        "Sort the mail",
        "Clean the desk",
        "Put dishes in the dishwasher",
        "Wipe down the {room} counters",
        "Move files from downloads to correct folders",
        "Label the storage boxes",
        "Unsubscribe from unwanted newsletters",
        "Update phone contacts",
        "Charge all devices",
        "Empty the recycle bin",
        "Shred old documents",
    ],
}

ENERGY_LEVEL_AMBIGUOUS = [
    ("Look into {topic}", "medium-focus"),
    ("Fix the {problem}", "medium-focus"),
    ("Organize {room}", "low-energy"),
    ("Read about {topic}", "medium-focus"),
    ("Clean up {system}", "low-energy"),
    ("Prepare for {event}", "medium-focus"),
    ("Review {document}", "medium-focus"),
    ("Sort through {item}", "low-energy"),
]

# ---------------------------------------------------------------------------
# 3. Time Estimate
# ---------------------------------------------------------------------------
TIME_ESTIMATE_TEMPLATES = {
    "quick": [
        "Text {person} the address",
        "Star that email for later",
        "Set a reminder for {date}",
        "Forward {document} to {person}",
        "Lock the {room} door",
        "Turn off the lights in {room}",
        "Add {item} to the shopping list",
        "Approve {person}'s calendar invite",
        "Check the weather for {date}",
        "Bookmark the link to {url}",
        "Mute the group chat",
        "Mark the task as done in {tool}",
        "Glance at {person}'s message",
        "Snooze the alarm",
        "Toggle the setting in {tool}",
        "Take a quick photo of {document}",
        "Send a thumbs up reply",
        "Add a label to the email",
        "Close the browser tab",
        "Set the thermostat to 72",
    ],
    "short": [
        "Reply to {person}'s email about {topic}",
        "Review {person}'s one-page summary",
        "File the expense for {amount}",
        "Call {person} to confirm {event}",
        "Write a quick Slack update on {topic}",
        "Update the spreadsheet with this week's {data}",
        "Scan and upload {document}",
        "Order {item} from {store}",
        "Schedule a meeting with {person}",
        "Back up photos from the phone",
        "Do a quick 15-minute {exercise} session",
        "Make a grocery list for the week",
        "Clean the {room} countertops",
        "Read the one-pager on {topic}",
        "Check in with {person} about {topic}",
        "Fix the typo in {document}",
        "Print and sign {document}",
        "Quick tidy of the desk",
        "Pay the {bill} online",
        "Unsubscribe from spam emails",
    ],
    "medium": [
        "Write the weekly status report",
        "Prepare the presentation slides for {event}",
        "Deep clean the {room}",
        "Cook {meal} from scratch",
        "Go through the GTD weekly review",
        "Meet with {person} about {topic}",
        "Write a blog post about {topic}",
        "Set up the new {tool} workspace",
        "Run errands: {store} and post office",
        "Meal prep for the next three days",
        "Review and update the family budget",
        "Attend the {event}",
        "Research {topic} and summarize findings",
        "Fix the {fixture} in the {room}",
        "Practice {skill} for 45 minutes",
        "Reorganize the {room} closet",
        "Have a 1:1 with {person} about career goals",
        "Configure {system} with new settings",
        "Sort through a month of receipts",
        "Write documentation for {feature}",
    ],
    "long": [
        "Build the prototype for {feature}",
        "Write the comprehensive report on {topic}",
        "Paint the {room}",
        "Deep dive research into {topic} alternatives",
        "Redesign the entire {system}",
        "Move furniture and rearrange the {room}",
        "Complete the online course module on {skill}",
        "Migrate {system} to {platform}",
        "Organize and declutter the entire garage",
        "Plan the full {event} from start to finish",
        "Write the proposal and budget for {project}",
        "Build the dashboard for {data} visualization",
        "Deep clean the entire house",
        "Set up the new home office from scratch",
        "Tax preparation and filing",
        "Rewrite the {system} API from scratch",
        "Conduct interviews for the {role} position all day",
        "Full-day workshop on {topic}",
        "Pack and prep for the move to {location}",
        "Create the training curriculum for {group}",
    ],
}

TIME_ESTIMATE_AMBIGUOUS = [
    ("Fix {problem}", "short"),
    ("Talk to {person} about {topic}", "short"),
    ("Organize {room}", "medium"),
    ("Update {document}", "short"),
    ("Research {topic}", "medium"),
    ("Clean up {system}", "medium"),
    ("Review {document}", "short"),
    ("Help {person} with {topic}", "medium"),
]

# ---------------------------------------------------------------------------
# 4. GTD Horizon
# ---------------------------------------------------------------------------
GTD_HORIZON_TEMPLATES = {
    "runway": [
        "Call {person} about {topic}",
        "Buy {item} from {store}",
        "Send {document} to {person}",
        "Fix the {problem}",
        "Reply to {person}'s email",
        "Print {document}",
        "Take out the trash",
        "Schedule dentist appointment",
        "Pay the {bill}",
        "Pick up {item} from {store}",
        "File {document}",
        "Text {person} about {event}",
        "Water the plants",
        "Clean the {room}",
        "Submit expense report",
        "Return {item} to {store}",
        "Book the meeting room",
        "Charge the laptop",
        "Order lunch for {event}",
        "Update {system} with {data}",
    ],
    "10k-projects": [
        "Plan the kitchen renovation",
        "Launch {product} by Q3",
        "Organize the family reunion",
        "Migrate {system} to {platform}",
        "Complete the {skill} certification",
        "Hire a new {role} for the team",
        "Write and publish the annual report",
        "Build {feature} end-to-end",
        "Plan the trip to {location}",
        "Redesign the onboarding process",
        "Set up the new home office",
        "Create the marketing campaign for {product}",
        "Onboard {person} to the team",
        "Prepare for the board presentation",
        "Execute {project}",
        "Move to the new apartment in {location}",
        "Plan and host {event}",
        "Train the team on {tool}",
        "Implement the new {system}",
        "Coordinate the office relocation",
    ],
    "20k-areas": [
        "Keep the house maintained and organized",
        "Stay on top of personal finances",
        "Maintain good health and fitness",
        "Be a supportive partner and parent",
        "Manage the engineering team effectively",
        "Keep professional skills current",
        "Maintain strong client relationships",
        "Stay organized with GTD system",
        "Keep the car in good working condition",
        "Manage the department budget responsibly",
        "Nurture friendships and social connections",
        "Stay compliant with industry regulations",
        "Maintain work-life balance",
        "Keep the garden healthy and productive",
        "Ensure IT security best practices",
        "Manage vendor relationships",
        "Support team members' growth",
        "Maintain the family calendar",
        "Keep emergency supplies stocked",
        "Stay current with industry trends",
    ],
    "30k-goals": [
        "Get promoted to senior {role} within 2 years",
        "Save {amount} for a house down payment by next year",
        "Run a marathon by end of year",
        "Launch {idea} and get first 100 customers",
        "Become fluent in Spanish within 18 months",
        "Pay off all credit card debt by December",
        "Get the {skill} certification by Q3",
        "Grow the team from 5 to 12 people this year",
        "Lose 30 pounds and keep it off",
        "Read 50 books this year",
        "Increase revenue by 25% year-over-year",
        "Build an emergency fund of 6 months expenses",
        "Complete the MBA program",
        "Launch the redesigned {system} by June",
        "Reduce customer churn to under 5%",
        "Write and publish a book on {topic}",
        "Double the podcast listener base",
        "Achieve work-life balance score of 8/10",
        "Mentor 3 junior engineers to promotion",
        "Establish a regular meditation practice",
    ],
    "40k-vision": [
        "Build a life where I work on what matters most to me",
        "Create a company that changes how people manage their time",
        "Live in a place where I can enjoy nature every day",
        "Be known as an expert and thought leader in {topic}",
        "Achieve financial independence by age 50",
        "Raise children who are kind, curious, and resilient",
        "Create a legacy of open-source tools that help millions",
        "Build a community of lifelong learners",
        "Live a healthy, active life into my 90s",
        "Create art that moves and inspires people",
        "Design a career that blends creativity and technology",
        "Build wealth that supports three generations",
        "Become a world-class {skill} practitioner",
        "Create a home that's a sanctuary for the family",
        "Lead an organization that people love working at",
        "Travel to every continent and learn from every culture",
        "Write books that help people think differently",
        "Build a personal brand that opens doors globally",
        "Design a retirement life full of purpose and adventure",
        "Leave every community better than I found it",
    ],
}

GTD_HORIZON_AMBIGUOUS = [
    ("Get better at {skill}", "20k-areas"),
    ("Improve the {system}", "10k-projects"),
    ("Think about what I really want", "40k-vision"),
    ("Start saving more money", "30k-goals"),
    ("Be more organized", "20k-areas"),
    ("Fix the {problem} properly this time", "runway"),
    ("Maybe start {idea}", "30k-goals"),
    ("Work on being healthier", "20k-areas"),
    ("Make progress on {project}", "10k-projects"),
    ("Figure out my career direction", "40k-vision"),
]

# ---------------------------------------------------------------------------
# 5. Knowledge Domain
# ---------------------------------------------------------------------------
KNOWLEDGE_DOMAIN_TEMPLATES = {
    "work": [
        "Prepare the quarterly business review slides",
        "Meet with {person} about the project timeline",
        "Submit the expense report for the client trip",
        "Review {person}'s performance evaluation",
        "Update the project board in {tool}",
        "Draft the job description for the new {role}",
        "Attend the all-hands meeting",
        "Send the weekly status update to {department}",
        "Complete the compliance training module",
        "Prepare for tomorrow's client presentation",
        "Review the vendor contract before signing",
        "Update the team wiki with new procedures",
        "Coordinate with {department} on {project}",
        "File the travel request for the conference",
        "Schedule the team offsite for next quarter",
        "Write the post-mortem for the {problem} incident",
        "Onboard the new hire {person}",
        "Review the budget allocation for Q4",
        "Prepare talking points for the stakeholder meeting",
        "Submit the patent application for {feature}",
    ],
    "personal": [
        "Call mom to catch up",
        "Plan the anniversary dinner",
        "Organize the photo albums",
        "Journal about how the week went",
        "Meditate for 20 minutes",
        "Read before bed",
        "Plan the weekend activities",
        "Write in the gratitude journal",
        "Reorganize the closet",
        "Plan a surprise for {person}'s birthday",
        "Update the family calendar",
        "Declutter the {room}",
        "Watch the movie {person} recommended",
        "Take the dog for a long walk",
        "Plan the holiday decorations",
        "Write a letter to {person}",
        "Sort through old clothes for donation",
        "Set up the new bookshelf",
        "Plan a fun day trip for the family",
        "Order flowers for {person}",
    ],
    "health": [
        "Schedule annual checkup with {doctor}",
        "Do a 30-minute {exercise} session",
        "Prep healthy lunches for the week",
        "Refill {medication} at the pharmacy",
        "Track daily water intake",
        "Schedule the flu shot",
        "Research physical therapy options for back pain",
        "Book a massage appointment",
        "Log meals in the nutrition app",
        "Go for a morning run",
        "Make a smoothie with greens",
        "Stretch for 15 minutes",
        "Check blood pressure",
        "Schedule a therapy appointment",
        "Research sleep improvement techniques",
        "Buy vitamins and supplements",
        "Plan this week's workout schedule",
        "Do a mental health check-in",
        "Sign up for the gym",
        "Cook a low-sodium dinner",
    ],
    "finance": [
        "Review this month's credit card statement",
        "Pay the {bill} before the due date",
        "Update the monthly budget spreadsheet",
        "Transfer {amount} to the savings account",
        "Review investment portfolio performance",
        "File quarterly estimated taxes",
        "Call the bank about the overdraft fee",
        "Compare car insurance quotes",
        "Set up automatic bill payments",
        "Review the 401k contribution percentage",
        "Track business expenses for tax deductions",
        "Cancel the unused subscription to {tool}",
        "Request a credit report",
        "Meet with the financial advisor",
        "Review the mortgage refinancing options",
        "Calculate net worth and update tracker",
        "Submit the insurance claim for {amount}",
        "Open a high-yield savings account",
        "Review and update beneficiary designations",
        "Create a spending plan for the vacation",
    ],
    "creative": [
        "Sketch ideas for the new painting",
        "Practice {instrument} for 45 minutes",
        "Write 1000 words of the novel",
        "Edit photos from the weekend shoot",
        "Record a new episode of the podcast",
        "Design the poster for {event}",
        "Experiment with new {art_form} techniques",
        "Write lyrics for the new song",
        "Set up the studio lighting",
        "Brainstorm content ideas for next month",
        "Work on the short story draft",
        "Take photos at golden hour",
        "Practice {art_form} for an hour",
        "Mix and master the demo track",
        "Create social media graphics for the brand",
        "Write a poem about {topic}",
        "Plan the creative project timeline",
        "Curate the portfolio website",
        "Sketch character designs for the comic",
        "Film behind-the-scenes content",
    ],
    "tech": [
        "Set up the new development environment",
        "Update all packages to latest versions",
        "Configure the backup system",
        "Debug the {problem} in {system}",
        "Set up CI/CD pipeline for {project}",
        "Migrate the database to {platform}",
        "Update the SSL certificates",
        "Review security audit findings",
        "Set up monitoring alerts for {system}",
        "Upgrade the home WiFi router",
        "Install the latest OS update",
        "Configure the new {tool} integration",
        "Write unit tests for {feature}",
        "Optimize the database queries",
        "Set up the home lab server",
        "Review and rotate API keys",
        "Configure the firewall rules",
        "Automate the deployment process",
        "Set up a VPN for remote work",
        "Profile and fix performance bottleneck in {system}",
    ],
    "social": [
        "Plan the dinner party for Saturday",
        "RSVP to {person}'s wedding",
        "Organize the neighborhood block party",
        "Volunteer at the community food bank",
        "Plan the holiday gift exchange with {group}",
        "Host the book club meeting",
        "Attend the networking event downtown",
        "Send thank-you notes after the party",
        "Coordinate the surprise party for {person}",
        "Join the local running group",
        "Sign up for the community cleanup day",
        "Plan the team building activity",
        "Invite {person} to coffee",
        "Organize the potluck sign-up sheet",
        "Attend {friend}'s gallery opening",
        "Host game night this Friday",
        "RSVP for the charity gala",
        "Plan the reunion with college friends",
        "Coordinate carpooling for {event}",
        "Send holiday cards to family and friends",
    ],
    "admin": [
        "Renew the car registration",
        "File the paperwork for {document}",
        "Sort and recycle the junk mail",
        "Update the home insurance policy",
        "Organize the filing cabinet",
        "Make copies of {document} for records",
        "Drop off the package at the post office",
        "Renew the passport application",
        "Submit the HOA form",
        "Schedule the home inspection",
        "Update the emergency contacts list",
        "File the warranty info for {item}",
        "Call the utility company about the bill",
        "Update the address on all accounts",
        "Shred old tax documents",
        "Organize the medicine cabinet",
        "Take the car for state inspection",
        "Get the notarized document for {document}",
        "Order new checks from the bank",
        "Renew the professional license",
    ],
}

KNOWLEDGE_DOMAIN_AMBIGUOUS = [
    ("Set up {tool} for the project", "work"),
    ("Check in with {person}", "personal"),
    ("Go for a walk", "health"),
    ("Pay for {item}", "finance"),
    ("Take photos of {event}", "creative"),
    ("Fix the {problem}", "tech"),
    ("Meet {friend} for lunch", "social"),
    ("File {document}", "admin"),
    ("Research {topic}", "work"),
    ("Order {item} online", "admin"),
    ("Call {person} about {event}", "social"),
    ("Schedule {event}", "admin"),
]

# ---------------------------------------------------------------------------
# 6. Emotional Valence
# ---------------------------------------------------------------------------
EMOTIONAL_VALENCE_TEMPLATES = {
    "positive": [
        "Exciting news! Got the promotion to {role}",
        "Can't wait for the trip to {location} next week",
        "{person} loved the {document} I presented",
        "Finally finished {project} -- it turned out great!",
        "Great feedback from {person} on {topic}",
        "Feeling motivated to start {exercise} again",
        "Had an amazing conversation with {person} about {topic}",
        "So grateful for {person}'s help with {topic}",
        "The team crushed it on {project} this quarter",
        "Looking forward to learning {skill}",
        "Just booked the dream vacation to {location}!",
        "Really proud of how {project} turned out",
        "Wonderful idea from {person} about {topic}",
        "Love how {tool} simplified our workflow",
        "Great milestone: saved {amount} this month",
        "{person} agreed to collaborate on {idea} -- let's go!",
        "Finally cracked the {problem} -- elegant solution",
        "Birthday party for {person} is going to be wonderful",
        "Team morale is high after finishing {project}",
        "The {event} was the best one yet",
    ],
    "neutral": [
        "Meeting scheduled with {person} on {date}",
        "The office is located at {location}",
        "{person}'s phone number is {phone}",
        "The report is 47 pages long",
        "Current inventory count: 234 units",
        "The next team meeting is {date} at {time}",
        "Project is currently in phase 3 of 5",
        "Temperature in the office is 72 degrees",
        "{company} was founded in 2015",
        "The file is saved in {system}",
        "Meeting room B is available from {time}",
        "The quarterly report covers January through March",
        "{person} works in the {department} department",
        "The server runs on {platform}",
        "Current exchange rate is 1.08",
        "The document has been filed under {topic}",
        "Next holiday is {date}",
        "Standard operating procedure updated {date}",
        "The printer is on the 3rd floor",
        "Team size is currently 8 people",
    ],
    "negative": [
        "Frustrated with the {problem} -- third time it's broken",
        "Really disappointed with {person}'s work on {document}",
        "The {project} is way behind schedule and it's demoralizing",
        "Fed up with the constant {problem} in {system}",
        "The client rejected {document} again -- what a waste",
        "Another meeting that could have been an email",
        "Lost {amount} on that failed investment",
        "The {fixture} broke AGAIN -- so annoying",
        "Dreading the conversation with {person} about {topic}",
        "The whole {project} feels like a mess",
        "Exhausted from dealing with the {problem} all day",
        "Missed the deadline for {document} -- {person} isn't happy",
        "The {event} was a total disaster",
        "Wasted the whole afternoon on {problem}",
        "{person} dropped the ball on {topic}",
        "Another rejected proposal for {project}",
        "The {system} crashed and we lost data",
        "So tired of the commute to {location}",
        "The renovation costs went {amount} over budget",
        "Can't believe {person} cancelled the {event} last minute",
    ],
    "anxious": [
        "Not sure I can finish {document} before the deadline",
        "Worried about the upcoming performance review",
        "What if the {project} fails completely?",
        "Stressed about the presentation to {person} on {date}",
        "Feeling overwhelmed by everything on my plate",
        "The bills are piling up and I'm not sure I can cover {bill}",
        "Haven't heard back from {person} about {topic} -- is that bad?",
        "Keep putting off calling {person} about {topic}",
        "What if they don't like my work on {document}?",
        "Nervous about the interview at {company}",
        "Not sure if I'm qualified enough for the {role} position",
        "The {problem} is getting worse and I don't know how to fix it",
        "Worried I'll forget something important for {event}",
        "Feeling paralyzed looking at the todo list",
        "Not sleeping well because of {topic} stress",
        "What if {person} says no to {project}?",
        "Anxious about the medical results from {doctor}",
        "Terrified of messing up the {event} presentation",
        "Overwhelmed by the scope of {project}",
        "Can't stop worrying about {topic} at night",
    ],
}

EMOTIONAL_VALENCE_AMBIGUOUS = [
    ("{person} wants to talk about {topic}", "neutral"),
    ("The {project} is taking longer than expected", "negative"),
    ("Need to prepare for {event}", "anxious"),
    ("Interesting opportunity with {company}", "positive"),
    ("Things are changing at work", "anxious"),
    ("Got feedback from {person}", "neutral"),
    ("The {system} needs updating", "neutral"),
    ("Trying something new with {skill}", "positive"),
]

# ---------------------------------------------------------------------------
# 7. Collaboration Type
# ---------------------------------------------------------------------------
COLLABORATION_TYPE_TEMPLATES = {
    "solo": [
        "Write the report on {topic}",
        "Clean the {room}",
        "Practice {skill} for an hour",
        "Read the book about {topic}",
        "Go for a {exercise} session",
        "Organize my desk",
        "Review my notes on {topic}",
        "Update my personal budget",
        "Meditate for 20 minutes",
        "Declutter the {room}",
        "Write in my journal",
        "Research {topic} independently",
        "File my own expense report",
        "Study for the {skill} certification",
        "Cook {meal} for dinner",
        "Sort through old emails",
        "Organize my files in {tool}",
        "Plan my personal goals for the quarter",
        "Do the {exercise} workout",
        "Update my resume",
    ],
    "delegation": [
        "Have {person} handle the {document} for {department}",
        "Assign {person} to fix the {problem}",
        "Ask {person} to order {item} from {store}",
        "Delegate the data entry to {person}",
        "Have the intern prepare {document}",
        "Ask {person} to schedule {event}",
        "Get {department} to process the {document}",
        "Have {person} run the weekly report",
        "Assign {person} to update {system}",
        "Let {person} take over the {topic} research",
        "Ask the assistant to book the travel",
        "Have {person} draft the initial {document}",
        "Get {person} to follow up with {company}",
        "Delegate filing {document} to the team",
        "Ask {person} to coordinate {event} logistics",
        "Have someone clean the {room}",
        "Get {person} to set up {tool}",
        "Assign the {problem} ticket to {person}",
        "Hand off the {project} status updates to {person}",
        "Ask {person} to collect {data} from the team",
    ],
    "collaboration": [
        "Brainstorm with {person} about {topic}",
        "Pair program with {person} on {feature}",
        "Workshop the {document} with the team",
        "Co-author the proposal with {person}",
        "Jam session with {person} on {instrument}",
        "Plan the {event} together with {person}",
        "Review {document} with {person} and give joint feedback",
        "Work with {department} on the cross-functional {project}",
        "Team design sprint for {feature}",
        "Collaborative editing session on {document}",
        "Sync with {person} and {person} on {topic} approach",
        "Whiteboard the architecture with the team",
        "Joint interview with {person} for the {role} candidate",
        "Work together with {person} to debug {problem}",
        "Co-lead the {event} with {person}",
        "Group review of {data} with {department}",
        "Partner with {person} on the {project} presentation",
        "Team retrospective on {project}",
        "Facilitate the {topic} discussion with {group}",
        "Co-create the training materials with {person}",
    ],
}

COLLABORATION_TYPE_AMBIGUOUS = [
    ("Get help from {person} on {topic}", "collaboration"),
    ("Handle the {problem}", "solo"),
    ("Send {document} to {person} for review", "delegation"),
    ("Work on {project}", "solo"),
    ("Meet with {person} about {topic}", "collaboration"),
    ("Ask {person} about {topic}", "collaboration"),
    ("Take care of {document}", "solo"),
    ("Get {person} involved in {topic}", "collaboration"),
]

# ---------------------------------------------------------------------------
# 8. Information Lifecycle
# ---------------------------------------------------------------------------
INFORMATION_LIFECYCLE_TEMPLATES = {
    "ephemeral": [
        "Today's standup updates: {person} is on {topic}",
        "The weather tomorrow will be sunny",
        "Traffic is backed up on the highway right now",
        "Currently {person} is in a meeting until {time}",
        "Today's lunch special is {meal}",
        "The server load is at 78% right now",
        "Current wait time is about 20 minutes",
        "Today's {event} starts at {time}",
        "{person} is out of office until this afternoon",
        "The parking lot on level 3 is full right now",
        "Today's stock price opened at {amount}",
        "The build is currently running -- ETA 15 minutes",
        "Right now {person} is available for a quick chat",
        "There's fresh coffee in the {room}",
        "The elevator is temporarily out of service",
        "Current sprint velocity is tracking at 32 points",
        "Today's deployment window is {time} to {time}",
        "The intern starts {date}",
        "Flash sale at {store} -- ends tonight",
        "Meeting room B is taken for the next hour",
    ],
    "short-lived": [
        "Sprint goals for this week: deliver {feature}",
        "Action items from today's meeting with {person}",
        "This week's priorities: {topic} and {project}",
        "Current project status: 60% complete",
        "Notes from the brainstorming session on {topic}",
        "Upcoming deadlines: {document} due {date}",
        "This month's marketing campaign metrics",
        "Current iteration backlog items",
        "Temporary workaround for the {problem}",
        "Current team assignments for the {project} phase",
        "This quarter's hiring pipeline status",
        "Active experiment results for {feature}",
        "Current vendor negotiation status with {company}",
        "Weekly meal plan: {meal} and {meal}",
        "Temporary access credentials for {system}",
        "Current sprint blockers: {problem}",
        "This month's budget remaining: {amount}",
        "Upcoming travel: {location} on {date}",
        "Current office layout during renovation",
        "Draft agenda for next week's {event}",
    ],
    "stable": [
        "The quarterly review process starts the first Monday of each quarter",
        "Project {project} architecture uses {platform}",
        "Team code review guidelines require 2 approvals",
        "Department budget approval process takes 5 business days",
        "The {system} runs on {platform} with weekly backups",
        "Standard meeting cadence: daily standup, weekly 1:1, monthly all-hands",
        "Remote work policy: 3 days in office, 2 remote",
        "Customer onboarding process: 3 phases over 30 days",
        "Annual conference is always the second week of October",
        "The team uses {tool} for project management",
        "Deployment process: staging → QA → production",
        "Annual performance reviews happen in December",
        "The gym routine: {exercise} Mon/Wed/Fri",
        "Monthly financial review on the last Friday",
        "Standard response time for support: 4 hours",
        "Release cycle: every 2 weeks on Thursday",
        "Office lease runs through 2027",
        "Health insurance enrollment opens every November",
        "The {system} migration path is documented in {tool}",
        "Team structure: 3 pods of 4 engineers each",
    ],
    "permanent": [
        "{person}'s birthday is March 15",
        "Company tax ID: {number}",
        "{person} is allergic to peanuts",
        "Social security number is stored in {tool}",
        "The house was built in 1987",
        "Married {person} on June 12, 2018",
        "Blood type: O positive",
        "Children: two boys, born 2019 and 2021",
        "{person} passed away in 2022",
        "College degree: BS Computer Science from State University",
        "First car: 2004 Honda Civic",
        "Parents' address: {location}",
        "The family recipe for {meal} from grandma",
        "Passport number: {number}",
        "Born in {location}",
        "Military service: 2008-2012",
        "The company was incorporated in Delaware in 2016",
        "Property deed recorded: lot 47, block 12",
        "Veteran status: honorably discharged",
        "Legal name change was finalized {date} 2020",
    ],
}

INFORMATION_LIFECYCLE_AMBIGUOUS = [
    ("{person} said {topic} is the priority", "short-lived"),
    ("The {system} is configured for {platform}", "stable"),
    ("Team is working on {project}", "short-lived"),
    ("{person}'s phone number is {phone}", "permanent"),
    ("Currently using {tool} for {topic}", "stable"),
    ("The weather has been terrible this week", "ephemeral"),
    ("{person} joined the company last year", "permanent"),
    ("Project deadline is {date}", "short-lived"),
]

# ---------------------------------------------------------------------------
# 9. Review Cadence
# ---------------------------------------------------------------------------
REVIEW_CADENCE_TEMPLATES = {
    "daily": [
        "Check the inbox for urgent messages",
        "Review today's calendar and commitments",
        "Process new inbox items",
        "Check on active waiting-for items",
        "Review the day's next actions list",
        "Update the daily standup notes",
        "Check {system} monitoring alerts",
        "Process today's email",
        "Water the plants",
        "Review active sprint tasks",
        "Check today's appointments",
        "Track daily habits",
        "Log today's meals and exercise",
        "Check daily sales numbers",
        "Review and prioritize tomorrow's tasks",
        "End-of-day journal entry",
        "Process new customer tickets",
        "Check build status",
        "Update the team on progress",
        "Review daily metrics dashboard",
    ],
    "weekly": [
        "GTD weekly review: process all inboxes",
        "Review all active projects for next actions",
        "Update the weekly status report",
        "Review the someday/maybe list",
        "Check the waiting-for list for follow-ups",
        "Plan meals for next week",
        "Review this week's spending against budget",
        "Tidy the desk and workspace",
        "Review and update the project board",
        "Sync with {person} in weekly 1:1",
        "Review the weekly team metrics",
        "Update the shared family calendar",
        "Back up files and photos",
        "Review recurring tasks for the week ahead",
        "Check the parking and transit pass",
        "Review subscriptions and cancel unused ones",
        "Update the time tracking summary",
        "Prepare the weekly team update",
        "Review the upcoming week's deadlines",
        "Organize digital files from the past week",
    ],
    "monthly": [
        "Review and update the monthly budget",
        "Check all areas of responsibility",
        "Review long-term goals progress",
        "Update the resume and LinkedIn profile",
        "Review insurance coverage",
        "Check credit card statements for errors",
        "Review the content calendar",
        "Update the home maintenance checklist",
        "Review investment portfolio allocation",
        "Schedule medical appointments if due",
        "Review the team's monthly KPIs",
        "Check equipment and software licenses",
        "Review vendor performance",
        "Update the risk register",
        "Review the monthly P&L statement",
        "Check the state of emergency supplies",
        "Review the 30k goals list",
        "Clean out the fridge and pantry",
        "Review and update recurring automated payments",
        "Monthly retrospective and lessons learned",
    ],
    "quarterly": [
        "Strategic planning and OKR review",
        "Review the 5-year vision and adjust",
        "Assess career trajectory and goals",
        "Review and rebalance investment portfolio",
        "Evaluate work-life balance",
        "Review the annual budget and adjust forecasts",
        "Assess team performance and development plans",
        "Review the product roadmap",
        "Evaluate vendor contracts for renewal",
        "Review personal values and alignment",
        "Assess fitness goals and adjust program",
        "Review the 40k-vision horizon",
        "Evaluate and update the life insurance coverage",
        "Review charitable giving strategy",
        "Assess the home improvement roadmap",
        "Review professional development progress",
        "Evaluate the GTD system effectiveness",
        "Review relationship goals and social connections",
        "Assess the technology stack and tools",
        "Review and update the succession plan",
    ],
}

REVIEW_CADENCE_AMBIGUOUS = [
    ("Check on {topic}", "daily"),
    ("Review {document}", "weekly"),
    ("Assess progress on {project}", "monthly"),
    ("Think about long-term {topic}", "quarterly"),
    ("Follow up with {person}", "daily"),
    ("Update the {document}", "weekly"),
    ("Review the plan for {topic}", "monthly"),
    ("Evaluate the {system}", "quarterly"),
]

# ---------------------------------------------------------------------------
# 10. Cognitive Load
# ---------------------------------------------------------------------------
COGNITIVE_LOAD_TEMPLATES = {
    "trivial": [
        "Take out the trash",
        "Water the plants",
        "Lock the door",
        "Turn off the lights",
        "Sharpen pencils",
        "Refill the stapler",
        "Put dishes in the dishwasher",
        "Plug in the charger",
        "Hang up the coat",
        "Close the windows",
        "Wipe the counter",
        "Print {document}",
        "File the paper in the folder",
        "Throw away the junk mail",
        "Put the cap on the pen",
        "Move the chair back to the desk",
        "Press the start button on the dishwasher",
        "Switch the laundry to the dryer",
        "Put the book back on the shelf",
        "Recycle the empty bottles",
    ],
    "routine": [
        "Reply to {person}'s email about {topic}",
        "File the expense report",
        "Update the spreadsheet with this week's {data}",
        "Schedule a meeting with {person}",
        "Order {item} from {store}",
        "Process the incoming mail",
        "Follow the standard checklist for {event}",
        "Submit the weekly timesheet",
        "Run the regular backup procedure",
        "Update {system} with the latest {data}",
        "Follow up on outstanding invoices",
        "Restock the {supply}",
        "Send the standard onboarding email to {person}",
        "Fill out the standard form for {document}",
        "Run the daily report from {system}",
        "Process the standard return for {item}",
        "Check the routine maintenance schedule",
        "Update the recurring meeting agenda",
        "Send the monthly newsletter",
        "Post the weekly social media update",
    ],
    "complex": [
        "Debug the intermittent {problem} in {system}",
        "Create the project plan for {project}",
        "Analyze the quarterly financial trends",
        "Design the new onboarding flow for {feature}",
        "Write the technical specification for {project}",
        "Evaluate three competing {tool} options",
        "Plan the team reorganization",
        "Draft the contract terms with {company}",
        "Resolve the conflict between {person} and {person}",
        "Design the data migration strategy for {system}",
        "Create the test plan for {feature}",
        "Analyze customer churn patterns in the data",
        "Plan the multi-phase rollout of {project}",
        "Write the incident response playbook",
        "Design the API architecture for {feature}",
        "Evaluate the build-vs-buy decision for {tool}",
        "Create the hiring rubric for {role}",
        "Plan the disaster recovery procedure",
        "Map the stakeholder communication plan",
        "Design the performance monitoring system",
    ],
    "deep": [
        "Rethink the entire product strategy from first principles",
        "Write the PhD thesis chapter on {topic}",
        "Design a novel algorithm for the optimization problem",
        "Develop the company's 5-year strategic vision",
        "Write a research paper on {topic}",
        "Architect a system that handles 10x current scale",
        "Solve the fundamental design tension in {system}",
        "Develop a new mental model for thinking about {topic}",
        "Write a book chapter synthesizing diverse perspectives",
        "Design a curriculum that teaches {skill} from scratch",
        "Create an original framework for evaluating {topic}",
        "Develop the proof of concept for a new technology",
        "Write the founding document for the new initiative",
        "Design an experiment to validate the {topic} hypothesis",
        "Build a mathematical model of the business dynamics",
        "Create an original piece of music for {instrument}",
        "Develop the ethical framework for AI decision-making",
        "Write the patent application for the novel approach",
        "Design a language for expressing {topic} concepts",
        "Formulate the research question and methodology",
    ],
}

COGNITIVE_LOAD_AMBIGUOUS = [
    ("Fix {problem}", "routine"),
    ("Think about {topic}", "complex"),
    ("Organize {room}", "trivial"),
    ("Review {document}", "routine"),
    ("Plan {event}", "complex"),
    ("Update {system}", "routine"),
    ("Research {topic}", "complex"),
    ("Write about {topic}", "complex"),
]


# ===========================================================================
# All model template mappings
# ===========================================================================
MODEL_TEMPLATES = {
    "priority-matrix": {
        "templates": PRIORITY_MATRIX_TEMPLATES,
        "ambiguous": PRIORITY_MATRIX_AMBIGUOUS,
    },
    "energy-level": {
        "templates": ENERGY_LEVEL_TEMPLATES,
        "ambiguous": ENERGY_LEVEL_AMBIGUOUS,
    },
    "time-estimate": {
        "templates": TIME_ESTIMATE_TEMPLATES,
        "ambiguous": TIME_ESTIMATE_AMBIGUOUS,
    },
    "gtd-horizon": {
        "templates": GTD_HORIZON_TEMPLATES,
        "ambiguous": GTD_HORIZON_AMBIGUOUS,
    },
    "knowledge-domain": {
        "templates": KNOWLEDGE_DOMAIN_TEMPLATES,
        "ambiguous": KNOWLEDGE_DOMAIN_AMBIGUOUS,
    },
    "emotional-valence": {
        "templates": EMOTIONAL_VALENCE_TEMPLATES,
        "ambiguous": EMOTIONAL_VALENCE_AMBIGUOUS,
    },
    "collaboration-type": {
        "templates": COLLABORATION_TYPE_TEMPLATES,
        "ambiguous": COLLABORATION_TYPE_AMBIGUOUS,
    },
    "information-lifecycle": {
        "templates": INFORMATION_LIFECYCLE_TEMPLATES,
        "ambiguous": INFORMATION_LIFECYCLE_AMBIGUOUS,
    },
    "review-cadence": {
        "templates": REVIEW_CADENCE_TEMPLATES,
        "ambiguous": REVIEW_CADENCE_AMBIGUOUS,
    },
    "cognitive-load": {
        "templates": COGNITIVE_LOAD_TEMPLATES,
        "ambiguous": COGNITIVE_LOAD_AMBIGUOUS,
    },
}


# ---------------------------------------------------------------------------
# Generation logic (mirrors 20_generate_gtd_data.py exactly)
# ---------------------------------------------------------------------------
def generate(model_id: str, count_per_label: int) -> None:
    """Generate training data for the specified cognitive model."""
    config = MODEL_TEMPLATES[model_id]
    templates = config["templates"]
    ambiguous = config["ambiguous"]
    output_path = OUTPUT_DIR / f"{model_id}.jsonl"

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    labels = list(templates.keys())
    num_labels = len(labels)

    # Calculate ambiguous count (15-20% of total)
    total_regular = count_per_label * num_labels
    ambiguous_ratio = 0.17
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
    label_counts: dict[str, int] = {}
    for s in samples:
        label_counts[s["label"]] = label_counts.get(s["label"], 0) + 1

    print(f"\n=== {model_id} Statistics ===")
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
    all_model_ids = get_all_model_ids()

    parser = argparse.ArgumentParser(
        description="Generate training data for cognitive model army",
    )
    parser.add_argument(
        "--model",
        choices=all_model_ids + ["all"],
        required=True,
        help="Which cognitive model to generate data for (or 'all')",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=400,
        help="Number of examples per label (default: 400)",
    )
    args = parser.parse_args()

    if args.count < 10:
        print(f"[ERROR] --count must be at least 10, got {args.count}", file=sys.stderr)
        sys.exit(1)

    models_to_generate = all_model_ids if args.model == "all" else [args.model]

    for model_id in models_to_generate:
        print(f"\n{'=' * 60}")
        print(f"Generating: {model_id}")
        print(f"Count per label: {args.count}")
        print(f"{'=' * 60}")
        generate(model_id, args.count)

    if args.model == "all":
        print(f"\n{'=' * 60}")
        print(f"ALL DONE -- Generated data for {len(models_to_generate)} cognitive models")
        print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
