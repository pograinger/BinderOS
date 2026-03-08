"""
30_generate_decomposition_data.py -- Synthetic Decomposition Pattern Training Data Generator

Generates labeled classification training examples for a decomposition pattern
classifier using Faker-generated entities embedded in template sentences.

Output: scripts/training-data/decomposition.jsonl
        (one JSON object per line: {"text": "...", "label": "..."})

Categories (~35 total):
    Task patterns (~25): plan-event, plan-trip, research-purchase, home-improvement,
        organize-space, learn-skill, complete-application, medical-health,
        financial-task, career-move, create-content, repair-fix,
        communication-task, errand-run, administrative, meal-prep, pet-care,
        digital-cleanup, gift-giving, moving-relocate, volunteer-community,
        fitness-goal, social-plan, childcare-parenting, maintenance-routine

    Decision patterns (~10): decide-purchase, decide-career, decide-living,
        decide-service, decide-financial, decide-technology, decide-health,
        decide-relationship, decide-education, decide-priority

Usage:
    python -u 30_generate_decomposition_data.py --output scripts/training-data/decomposition.jsonl
    python -u 30_generate_decomposition_data.py --output scripts/training-data/decomposition.jsonl --count 500

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
        "{city}": lambda: fake.city(),
        "{country}": lambda: fake.country(),
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
        # Decomposition-specific placeholders
        "{appliance}": lambda: random.choice([
            "the dishwasher", "the washing machine", "the dryer",
            "the refrigerator", "the oven", "the microwave",
            "the air conditioner", "the vacuum cleaner", "the garbage disposal",
        ]),
        "{vehicle}": lambda: random.choice([
            "the car", "the bike", "the truck", "the motorcycle",
            "the scooter", "the van",
        ]),
        "{pet}": lambda: random.choice([
            "the dog", "the cat", "the rabbit", "the bird",
            "the hamster", "the fish",
        ]),
        "{pet_type}": lambda: random.choice([
            "dog", "cat", "rabbit", "bird", "hamster", "fish",
        ]),
        "{exercise}": lambda: random.choice([
            "running", "swimming", "cycling", "weightlifting",
            "yoga", "pilates", "hiking", "CrossFit",
        ]),
        "{course}": lambda: random.choice([
            "an online course", "a certification program", "a workshop",
            "a bootcamp", "a night class", "a webinar series",
            "a tutorial series", "a masterclass",
        ]),
        "{cuisine}": lambda: random.choice([
            "Italian", "Mexican", "Thai", "Japanese", "Indian",
            "French", "Chinese", "Mediterranean", "Korean",
        ]),
        "{software}": lambda: random.choice([
            "Photoshop", "Excel", "Slack", "Notion", "Figma",
            "VS Code", "Zoom", "Google Workspace", "Salesforce",
            "QuickBooks", "Canva", "HubSpot",
        ]),
        "{insurance}": lambda: random.choice([
            "health insurance", "car insurance", "home insurance",
            "life insurance", "dental insurance", "renters insurance",
        ]),
        "{subscription}": lambda: random.choice([
            "Netflix", "Spotify", "gym membership", "newspaper",
            "meal kit service", "Amazon Prime", "cloud storage",
        ]),
        "{hobby}": lambda: random.choice([
            "painting", "guitar", "photography", "knitting",
            "gardening", "chess", "baking", "woodworking",
        ]),
        "{school}": lambda: random.choice([
            "the elementary school", "the middle school", "the high school",
            "the daycare", "the preschool", "the after-school program",
        ]),
        "{kid_activity}": lambda: random.choice([
            "soccer practice", "piano lessons", "swim class",
            "art class", "dance recital", "science camp",
            "tutoring", "scouts", "karate",
        ]),
        "{charity}": lambda: random.choice([
            "the food bank", "Habitat for Humanity", "the animal shelter",
            "the community garden", "the local library", "the homeless shelter",
            "the youth center", "the Red Cross",
        ]),
        "{recipient}": lambda: random.choice([
            "mom", "dad", "my partner", "my friend", "my coworker",
            "my sister", "my brother", "grandma", "my boss", "the neighbor",
        ]),
        "{occasion}": lambda: random.choice([
            "their birthday", "Christmas", "the anniversary",
            "the housewarming", "graduation", "Valentine's Day",
            "the baby shower", "the wedding", "Mother's Day", "Father's Day",
        ]),
        "{doctor}": lambda: random.choice([
            "the dentist", "the dermatologist", "the optometrist",
            "the cardiologist", "the therapist", "the orthopedist",
            "my primary care doctor", "the ENT", "the allergist",
        ]),
        "{treatment}": lambda: random.choice([
            "physical therapy", "medication", "surgery",
            "chiropractic care", "acupuncture", "counseling",
        ]),
        "{diet}": lambda: random.choice([
            "keto", "Mediterranean", "vegan", "paleo",
            "intermittent fasting", "low-carb", "whole30",
        ]),
        "{financial_item}": lambda: random.choice([
            "retirement account", "savings account", "credit card debt",
            "student loans", "mortgage", "investment portfolio",
            "emergency fund", "tax return",
        ]),
        "{neighborhood}": lambda: random.choice([
            "downtown", "the suburbs", "near the park",
            "the east side", "the west side", "by the school district",
            "close to work", "the historic district",
        ]),
    }

    result = template
    for placeholder, generator in replacements.items():
        while placeholder in result:
            result = result.replace(placeholder, generator(), 1)
    return result


# ---------------------------------------------------------------------------
# Task Patterns (~25 categories)
# ---------------------------------------------------------------------------
TASK_TEMPLATES = {
    "plan-event": [
        "Plan {event} for {date}",
        "Organize a surprise party for {person}",
        "Set up {event} with {group}",
        "Arrange {event} at {location}",
        "Coordinate {event} for {group}",
        "Plan a farewell gathering for {person}",
        "Organize a team building activity for {group}",
        "Set up a celebration for {person}'s promotion",
        "Arrange a holiday party for {department}",
        "Plan a reunion for {group}",
        "Put together {event} for next month",
        "Schedule and organize {event}",
        "Plan the logistics for {event}",
        "Get everything ready for {event} on {date}",
        "Organize a baby shower for {person}",
        "Plan a graduation party for {first_name}",
        "Set up a welcome event for the new {role}",
        "Arrange a company picnic for {date}",
        "Coordinate the holiday gift exchange for {group}",
        "Plan {person}'s retirement party",
    ],
    "plan-trip": [
        "Plan a trip to {city}",
        "Book flights to {country} for {date}",
        "Plan the itinerary for the {city} vacation",
        "Arrange transportation for the trip to {city}",
        "Pack for the trip to {country}",
        "Research hotels in {city}",
        "Plan a weekend getaway to {city}",
        "Organize the family vacation to {country}",
        "Book accommodations for the {city} trip",
        "Plan the road trip to {city}",
        "Get travel insurance for the {country} trip",
        "Make reservations for the {city} trip",
        "Plan activities for the vacation in {city}",
        "Arrange airport transfer for the {country} trip",
        "Book rental car for the {city} trip",
        "Plan the honeymoon to {country}",
        "Organize a group trip to {city} with friends",
        "Prepare documents for traveling to {country}",
        "Plan a business trip to {city} for {date}",
        "Schedule the flights and hotels for {city}",
    ],
    "research-purchase": [
        "Research the best laptop for work",
        "Find the right mattress to buy",
        "Shop for a gift for {person}",
        "Compare prices on a new phone",
        "Research new {appliance} options",
        "Find the best deal on a new couch",
        "Look into buying a new car",
        "Research which {item} to get",
        "Compare options for a new TV",
        "Shop around for {insurance}",
        "Research baby strollers to buy",
        "Find the best noise-canceling headphones",
        "Look into upgrading {appliance}",
        "Compare smart home devices",
        "Research the best running shoes",
        "Shop for new furniture for the {room}",
        "Find the right blender to buy",
        "Compare {software} plans and pricing",
        "Research which camera to buy for {hobby}",
        "Look into buying a stand-up desk",
    ],
    "home-improvement": [
        "Fix the {fixture} in the {room}",
        "Paint the {room}",
        "Install new shelves in the {room}",
        "Renovate the {room}",
        "Replace the flooring in the {room}",
        "Fix the {fixture}",
        "Install a ceiling fan in the {room}",
        "Update the lighting in the {room}",
        "Build a deck in the backyard",
        "Redo the backsplash in the kitchen",
        "Install a new toilet in the {room}",
        "Fix the drywall in the {room}",
        "Replace the windows in the {room}",
        "Build a closet organizer for the {room}",
        "Refinish the hardwood floors",
        "Install a new door for the {room}",
        "Fix the roof leak",
        "Add insulation to the {room}",
        "Update the bathroom fixtures",
        "Build a garden shed",
    ],
    "organize-space": [
        "Clean out the {space}",
        "Reorganize the {room}",
        "Declutter the {room}",
        "Organize the {space}",
        "Sort through the {space}",
        "Tidy up the {room}",
        "Clean and organize the garage",
        "Reorganize the kitchen pantry",
        "Declutter the {space} and donate extras",
        "Set up a better organization system for the {space}",
        "Sort through old clothes in the {room}",
        "Organize the tool bench in the garage",
        "Clean out under the bathroom sink",
        "Reorganize the home office",
        "Declutter the kids' playroom",
        "Organize the laundry room",
        "Sort through the filing cabinet",
        "Clean out the fridge and freezer",
        "Organize the craft supplies",
        "Set up storage bins for the {space}",
    ],
    "learn-skill": [
        "Take {course} on {skill}",
        "Practice {hobby} this week",
        "Study for the {topic} exam",
        "Learn how to use {software}",
        "Take up {hobby} as a new hobby",
        "Complete {course} on {skill}",
        "Start learning {skill}",
        "Follow a tutorial on {hobby}",
        "Sign up for {course} about {skill}",
        "Practice {skill} for 30 minutes daily",
        "Read a book about {skill}",
        "Watch instructional videos on {hobby}",
        "Take a beginner class in {hobby}",
        "Study {skill} using online resources",
        "Join a {hobby} group for practice",
        "Get a tutor for {skill}",
        "Work through the exercises in the {skill} textbook",
        "Attend a {hobby} workshop this month",
        "Start {course} to improve at {skill}",
        "Practice {skill} with {person}",
    ],
    "complete-application": [
        "Fill out the application for {company}",
        "Gather documents for the {topic} application",
        "Submit the application to {company}",
        "Complete the form for {department}",
        "Apply for the position at {company}",
        "Fill out the {insurance} application",
        "Submit paperwork for {thing}",
        "Complete the enrollment form for {school}",
        "Gather references for the {company} application",
        "Fill out the loan application",
        "Apply for a passport renewal",
        "Complete the tax forms",
        "Submit the grant application by {date}",
        "Fill out the registration for {event}",
        "Apply for the scholarship at {company}",
        "Complete the background check forms",
        "Gather documents for the mortgage application",
        "Fill out the visa application for {country}",
        "Submit the permit application for the renovation",
        "Complete the onboarding paperwork for {company}",
    ],
    "medical-health": [
        "Schedule a checkup with {doctor}",
        "Get the prescription refilled",
        "Start {exercise} routine",
        "Book an appointment with {doctor}",
        "Get blood work done",
        "Schedule a follow-up with {doctor}",
        "Start {treatment} sessions",
        "Make an appointment for the annual physical",
        "Get the kids' vaccinations updated",
        "Schedule a dental cleaning",
        "Book an eye exam",
        "Start a new {diet} diet plan",
        "Get the flu shot",
        "Schedule {treatment} appointments",
        "Make an appointment with {doctor} about the pain",
        "Get a second opinion from another specialist",
        "Start taking vitamins regularly",
        "Schedule a mammogram/screening",
        "Book a consultation for {treatment}",
        "Set up regular therapy sessions",
    ],
    "financial-task": [
        "Pay the bills this month",
        "File taxes by {date}",
        "Set up a monthly budget",
        "Review investment portfolio",
        "Pay off the {financial_item}",
        "Set up automatic bill payments",
        "Review {insurance} coverage",
        "File expense reports from the trip",
        "Set up a {financial_item}",
        "Pay the property taxes",
        "Review and update the household budget",
        "Set up direct deposit for the new job",
        "Balance the checkbook",
        "Submit insurance claims",
        "Review the monthly bank statements",
        "Set up a college savings fund",
        "Pay the {subscription} bill",
        "File the quarterly tax estimates",
        "Review the credit report",
        "Set up retirement contributions",
    ],
    "career-move": [
        "Update the resume",
        "Prepare for the interview at {company}",
        "Negotiate the salary offer from {company}",
        "Network with {person} about the {role} position",
        "Apply for jobs at {company}",
        "Polish the LinkedIn profile",
        "Prepare a portfolio of recent work",
        "Research salary ranges for the {role} position",
        "Write a cover letter for {company}",
        "Schedule informational interviews with people at {company}",
        "Update the resume for the {role} role",
        "Practice interview questions for {company}",
        "Get a recommendation from {person}",
        "Research the culture at {company}",
        "Take {course} to build credentials",
        "Prepare references for the {company} application",
        "Follow up on the application at {company}",
        "Prepare for the performance review",
        "Draft a proposal for a promotion",
        "Build skills for the {role} role",
    ],
    "create-content": [
        "Write a blog post about {topic}",
        "Record a video on {topic}",
        "Design a presentation for {event}",
        "Write an article about {topic}",
        "Create social media posts for {company}",
        "Edit the video about {topic}",
        "Design graphics for the {project}",
        "Write the newsletter for {group}",
        "Record a podcast episode about {topic}",
        "Create a tutorial on {skill}",
        "Write the annual report for {department}",
        "Design the flyer for {event}",
        "Create a pitch deck for {company}",
        "Write documentation for {system}",
        "Film a behind-the-scenes video",
        "Create infographics for {topic}",
        "Write a case study about {project}",
        "Design the website mockup for {company}",
        "Record a voiceover for the {product}",
        "Create a training guide for {tool}",
    ],
    "repair-fix": [
        "Fix {appliance}",
        "Repair {vehicle}",
        "Troubleshoot {system}",
        "Fix the {fixture} in the {room}",
        "Repair the broken fence",
        "Fix the computer that keeps crashing",
        "Repair the screen on the phone",
        "Fix the squeaky door",
        "Troubleshoot the WiFi connection issues",
        "Repair the bathroom {fixture}",
        "Fix the flat tire on {vehicle}",
        "Repair the torn jacket",
        "Fix the broken drawer in the {room}",
        "Troubleshoot {appliance} not working",
        "Repair the deck railing",
        "Fix the broken sprinkler system",
        "Repair the garage door opener",
        "Fix the clogged drain in the {room}",
        "Troubleshoot the printer not connecting",
        "Repair the broken bookshelf",
    ],
    "communication-task": [
        "Write an email to {person} about {topic}",
        "Call {person} about {topic}",
        "Send a thank-you note to {person}",
        "Draft a message to {group} about {topic}",
        "Write a letter to {person}",
        "Send a follow-up email to {person}",
        "Call {company} about {issue}",
        "Write feedback for {person}",
        "Send the update to {group}",
        "Draft an announcement about {topic}",
        "Write an apology to {person}",
        "Send condolences to {person}",
        "Draft a complaint to {company} about {issue}",
        "Write a recommendation for {person}",
        "Send RSVP for {event}",
        "Call {department} to discuss {topic}",
        "Draft an invitation for {event}",
        "Write the meeting recap for {group}",
        "Send a reminder to {person} about {event}",
        "Call the landlord about the {fixture}",
    ],
    "errand-run": [
        "Pick up dry cleaning",
        "Return the package to {store}",
        "Go grocery shopping",
        "Drop off donations at {charity}",
        "Pick up the prescription at {store}",
        "Return library books",
        "Mail the package at the post office",
        "Pick up {item} from {store}",
        "Drop off {vehicle} at the mechanic",
        "Get keys made at the hardware store",
        "Return {item} to {store}",
        "Pick up photos from the print shop",
        "Drop off the recycling",
        "Go to the bank to deposit checks",
        "Pick up the cake from the bakery",
        "Return the borrowed tools to {person}",
        "Drop off clothes at the tailor",
        "Go to the post office to mail {document}",
        "Pick up pet food from {store}",
        "Get the watch battery replaced",
    ],
    "administrative": [
        "Renew the driver's license",
        "Update {insurance} policy",
        "Cancel the {subscription}",
        "Renew the passport",
        "Update the address with {company}",
        "Cancel the old {subscription}",
        "Renew the vehicle registration",
        "Update emergency contacts at work",
        "Cancel and switch {insurance}",
        "Renew the professional certification",
        "Update the will and estate plan",
        "Cancel the gym membership",
        "Renew the domain name",
        "Update the beneficiaries on the {financial_item}",
        "Cancel the old phone plan",
        "Renew the library card",
        "Update the household inventory",
        "Cancel automatic renewals for {subscription}",
        "Renew the parking permit",
        "Update records with {department}",
    ],
    "meal-prep": [
        "Plan weekly meals",
        "Make a grocery list for the week",
        "Meal prep for Sunday",
        "Plan the dinner menu for {event}",
        "Batch cook {meal} for the week",
        "Prepare lunches for the school week",
        "Plan the {cuisine} dinner for Saturday",
        "Make the shopping list for {meal} ingredients",
        "Prep ingredients for the week's dinners",
        "Plan the holiday meal menu",
        "Batch cook {meal} and {meal} for the week",
        "Make a meal plan using the {diet} approach",
        "Prepare freezer meals for the month",
        "Plan the potluck dish for {event}",
        "Prep the slow cooker meal for tomorrow",
        "Make the shopping list from the meal plan",
        "Plan birthday dinner menu for {person}",
        "Prep snacks for the kids' lunches",
        "Plan a special {cuisine} dinner for {person}",
        "Make ahead breakfasts for the workweek",
    ],
    "pet-care": [
        "Schedule a vet appointment for {pet}",
        "Groom {pet}",
        "Buy pet supplies from {store}",
        "Take {pet} to the groomer",
        "Schedule {pet}'s vaccinations",
        "Buy food for {pet}",
        "Take {pet} for a checkup",
        "Get {pet}'s nails trimmed",
        "Book a pet sitter for the vacation",
        "Schedule {pet}'s dental cleaning",
        "Buy a new bed for {pet}",
        "Take {pet} to obedience training",
        "Get {pet}'s microchip registered",
        "Schedule the {pet_type}'s annual exam",
        "Buy flea and tick medication for {pet}",
        "Take {pet} to the park for exercise",
        "Set up a feeding schedule for {pet}",
        "Book a boarding spot for {pet}",
        "Get pet insurance for {pet}",
        "Take {pet} to the specialist",
    ],
    "digital-cleanup": [
        "Organize photos on the computer",
        "Clean out the email inbox",
        "Back up files to the cloud",
        "Sort through old emails and unsubscribe",
        "Organize the desktop files",
        "Delete old apps from the phone",
        "Clean up the downloads folder",
        "Organize photos into albums",
        "Back up the phone to the cloud",
        "Sort through and delete old documents",
        "Clean up the Google Drive",
        "Organize bookmarks in the browser",
        "Delete duplicate photos",
        "Back up important documents to {platform}",
        "Organize the music library",
        "Clean out old text messages",
        "Sort through cloud storage and free up space",
        "Organize the notes app",
        "Delete old accounts and unused subscriptions",
        "Back up {system} data before the update",
    ],
    "gift-giving": [
        "Choose a gift for {recipient} for {occasion}",
        "Wrap the presents for {occasion}",
        "Write cards for {occasion}",
        "Ship the gift to {person}",
        "Find a gift for {person}'s {occasion}",
        "Buy wrapping paper and ribbons",
        "Order a personalized gift for {recipient}",
        "Create a gift basket for {person}",
        "Buy a card for {recipient} for {occasion}",
        "Pick out a gift for the office {occasion}",
        "Wrap and label all the {occasion} gifts",
        "Order flowers for {recipient} for {occasion}",
        "Find a unique gift for {person}",
        "Ship the package to {person} before {date}",
        "Make a handmade gift for {recipient}",
        "Buy a gift card for {person}",
        "Choose the right gift for {recipient}",
        "Get the gifts ready for {occasion}",
        "Write a heartfelt message for {recipient}",
        "Plan the gift reveal for {person}",
    ],
    "moving-relocate": [
        "Find a new apartment in {city}",
        "Pack boxes for the move",
        "Change address with the post office",
        "Set up utilities at the new place",
        "Hire movers for {date}",
        "Pack up the {room}",
        "Transfer utilities to the new address",
        "Update address with {company}",
        "Get moving supplies from {store}",
        "Schedule the moving truck for {date}",
        "Forward mail to the new address",
        "Pack the fragile items in the {room}",
        "Disconnect utilities at the old place",
        "Update the address on {insurance}",
        "Arrange storage for extra furniture",
        "Deep clean the old apartment",
        "Set up internet at the new place",
        "Move the plants and pets safely",
        "Unpack and set up the new {room}",
        "Register to vote at the new address",
    ],
    "volunteer-community": [
        "Sign up to volunteer at {charity}",
        "Organize a donation drive for {charity}",
        "Attend the community meeting on {date}",
        "Volunteer at {charity} this weekend",
        "Organize a neighborhood cleanup",
        "Help set up for the charity event",
        "Sign up for the volunteer shift at {charity}",
        "Coordinate donations for {charity}",
        "Attend the PTA meeting on {date}",
        "Organize a fundraiser for {charity}",
        "Volunteer to coach the kids' team",
        "Plan the community garden project",
        "Sign up to mentor at {charity}",
        "Organize a food drive for {charity}",
        "Attend the homeowners' association meeting",
        "Help out at the church event on {date}",
        "Plan a volunteer outing for {group}",
        "Set up the booth at the community fair",
        "Register for the charity walk on {date}",
        "Organize the school bake sale",
    ],
    "fitness-goal": [
        "Create a workout plan",
        "Track fitness progress this month",
        "Find a gym near {location}",
        "Start a {exercise} program",
        "Set up a daily {exercise} routine",
        "Sign up for a gym membership",
        "Plan a 30-day fitness challenge",
        "Create a training schedule for the marathon",
        "Start doing {exercise} three times a week",
        "Track calories and macros for the {diet} plan",
        "Join a {exercise} class at the gym",
        "Set up a home workout space",
        "Hire a personal trainer",
        "Plan the {exercise} routine for the month",
        "Start a couch-to-5K running program",
        "Set fitness goals for the quarter",
        "Sign up for the local {exercise} group",
        "Create a stretching routine",
        "Plan the weekly workout schedule",
        "Start the {exercise} challenge with {person}",
    ],
    "social-plan": [
        "Organize dinner with friends on {date}",
        "Plan a game night for {date}",
        "Coordinate a group outing to {location}",
        "Set up a movie night with {person}",
        "Organize a brunch with {group}",
        "Plan a barbecue for the neighborhood",
        "Set up a double date with {person} and their partner",
        "Organize a book club meeting",
        "Plan a beach day with friends",
        "Coordinate a karaoke night",
        "Set up a coffee catch-up with {person}",
        "Organize a potluck dinner for {group}",
        "Plan a camping trip with friends",
        "Set up a happy hour for {group}",
        "Organize a birthday dinner for {person}",
        "Plan a bowling night for {date}",
        "Coordinate a hiking trip with {group}",
        "Set up a weekly tennis match with {person}",
        "Organize a holiday party for friends",
        "Plan a wine tasting outing with {group}",
    ],
    "childcare-parenting": [
        "Arrange a babysitter for {date}",
        "Plan a fun activity for the kids this weekend",
        "Enroll in {school}",
        "Sign up the kids for {kid_activity}",
        "Schedule a parent-teacher conference",
        "Plan the kids' birthday party",
        "Set up a playdate with {person}'s kids",
        "Arrange carpool for {kid_activity}",
        "Help the kids with their science project",
        "Plan summer camp activities",
        "Set up the kids' back-to-school supplies",
        "Schedule the kids' annual checkup",
        "Arrange after-school care",
        "Plan the kids' Halloween costumes",
        "Set up a homework routine for the kids",
        "Register for {kid_activity}",
        "Plan a family outing for the weekend",
        "Arrange childcare for the work trip",
        "Help kids prepare for the recital",
        "Schedule the kids' dentist appointment",
    ],
    "maintenance-routine": [
        "Schedule an oil change for {vehicle}",
        "Replace the air filter in the house",
        "Schedule the annual home inspection",
        "Get {vehicle} inspected",
        "Replace smoke detector batteries",
        "Schedule the HVAC maintenance",
        "Rotate the tires on {vehicle}",
        "Clean the gutters",
        "Schedule the pest control visit",
        "Get the chimney cleaned",
        "Replace the water filter",
        "Schedule the {appliance} maintenance",
        "Check and refill the fire extinguisher",
        "Get {vehicle} washed and detailed",
        "Schedule the annual furnace check",
        "Test the sump pump",
        "Flush the water heater",
        "Check the roof for damage",
        "Schedule the sprinkler system winterization",
        "Inspect the deck for repairs",
    ],
}


# ---------------------------------------------------------------------------
# Decision Patterns (~10 categories)
# ---------------------------------------------------------------------------
DECISION_TEMPLATES = {
    "decide-purchase": [
        "Decide which laptop to buy for work",
        "Choose between phone plans",
        "Pick the right {insurance} plan",
        "Decide which {appliance} to buy",
        "Choose between the two car options",
        "Decide on a new TV",
        "Pick the best mattress from the shortlist",
        "Choose which {software} subscription to get",
        "Decide between buying new or used {vehicle}",
        "Pick the right camera for {hobby}",
        "Decide on a new couch for the {room}",
        "Choose between the two laptop options",
        "Decide which smart watch to buy",
        "Pick the best deal on the new fridge",
        "Choose between brands for {item}",
        "Decide on the right running shoes",
        "Pick the best {software} plan for the team",
        "Decide between the two apartment options",
        "Choose which tablet to get",
        "Decide on the best monitor setup",
    ],
    "decide-career": [
        "Decide whether to accept the job offer from {company}",
        "Choose between staying or changing roles",
        "Decide if going back to school makes sense",
        "Figure out whether to pursue the {role} position",
        "Decide between the two job offers",
        "Choose whether to freelance or stay employed",
        "Decide if the promotion is worth the extra hours",
        "Figure out the next career move",
        "Decide whether to switch industries",
        "Choose between the {company} offer and the current job",
        "Decide if the relocation for {company} is worth it",
        "Figure out whether to start the side business",
        "Decide between staying and negotiating for more",
        "Choose whether to take the management track",
        "Decide if the remote position at {company} is a good fit",
        "Figure out if the certification is worth the investment",
        "Decide between the startup and the corporate role",
        "Choose whether to ask for a raise",
        "Decide if it's time to change careers",
        "Figure out whether to accept the transfer",
    ],
    "decide-living": [
        "Decide whether to move to {city}",
        "Choose between renting and buying",
        "Decide on the best neighborhood",
        "Figure out whether to stay or move",
        "Decide between {neighborhood} and {neighborhood}",
        "Choose the right school district for the kids",
        "Decide whether to downsize",
        "Figure out if {city} is the right move",
        "Decide between the house and the condo",
        "Choose whether to renovate or move",
        "Decide if moving closer to family makes sense",
        "Figure out the best living arrangement",
        "Decide between the apartment {neighborhood} and {neighborhood}",
        "Choose whether to get a roommate",
        "Decide if the commute to {city} is worth it",
        "Figure out the ideal location for the new place",
        "Decide between staying in {city} and moving to {city}",
        "Choose the right apartment size",
        "Decide whether to break the lease and move",
        "Figure out if buying a fixer-upper is worth it",
    ],
    "decide-service": [
        "Choose a contractor for the renovation",
        "Pick the right doctor for the family",
        "Decide on {school} for the kids",
        "Choose a financial advisor",
        "Pick the right real estate agent",
        "Decide on a moving company",
        "Choose between plumbers for the {fixture}",
        "Pick the best daycare option",
        "Decide on a wedding photographer",
        "Choose the right accountant for taxes",
        "Pick a mechanic for {vehicle}",
        "Decide on a caterer for {event}",
        "Choose the right {insurance} agent",
        "Pick a tutor for the kids",
        "Decide on a landscaper for the yard",
        "Choose between painters for the {room}",
        "Pick the right veterinarian for {pet}",
        "Decide on a cleaning service",
        "Choose a web designer for the business",
        "Pick the best home security company",
    ],
    "decide-financial": [
        "Decide on the investment allocation strategy",
        "Choose the right savings approach",
        "Figure out the best debt payoff method",
        "Decide between aggressive and conservative investing",
        "Choose how to allocate the bonus",
        "Decide on the retirement contribution amount",
        "Figure out the best way to pay off the {financial_item}",
        "Choose between refinancing and staying with the current rate",
        "Decide on the emergency fund target",
        "Figure out the best college savings strategy",
        "Decide between paying off debt and investing",
        "Choose the right tax strategy",
        "Figure out the best way to handle the inheritance",
        "Decide on the right level of life insurance",
        "Choose between a Roth and traditional IRA",
        "Decide how much to save vs spend this year",
        "Figure out the best approach for the {financial_item}",
        "Choose the right credit card rewards program",
        "Decide on the household budget allocation",
        "Figure out the best way to build the {financial_item}",
    ],
    "decide-technology": [
        "Decide which {software} to use for the team",
        "Choose between cloud platforms for the project",
        "Figure out the best tool for {purpose}",
        "Decide between {tool} and {tool}",
        "Choose the right {software} for {purpose}",
        "Decide on the tech stack for the project",
        "Figure out whether to switch from {tool} to {tool}",
        "Choose the best project management tool",
        "Decide between cloud storage providers",
        "Figure out the right CRM for the business",
        "Decide on the communication platform for {group}",
        "Choose between {software} options for design",
        "Figure out the best backup solution",
        "Decide on the right email service provider",
        "Choose between automation tools for {purpose}",
        "Decide whether {tool} is worth the cost",
        "Figure out the best analytics platform",
        "Choose the right development framework",
        "Decide on the hosting provider",
        "Figure out whether to build or buy the solution",
    ],
    "decide-health": [
        "Decide on the right {treatment} approach",
        "Choose the best {diet} plan",
        "Figure out which fitness program to follow",
        "Decide between {treatment} options",
        "Choose the right therapist",
        "Decide whether surgery is the right option",
        "Figure out the best approach to manage stress",
        "Choose between medication options",
        "Decide on the right sleep routine",
        "Figure out the best way to handle the diagnosis",
        "Decide between holistic and conventional {treatment}",
        "Choose the right mental health approach",
        "Figure out if the specialist is worth seeing",
        "Decide on the right supplement routine",
        "Choose between the two treatment plans",
        "Decide whether to try {treatment}",
        "Figure out the best recovery approach",
        "Choose the right prenatal care provider",
        "Decide on the best approach to chronic pain",
        "Figure out whether to get the second opinion",
    ],
    "decide-relationship": [
        "Figure out how to approach the conflict with {person}",
        "Decide the best way to support {person}",
        "Choose how to handle the situation with {person}",
        "Figure out whether to bring up the issue with {person}",
        "Decide how to set boundaries with {person}",
        "Choose the best approach to the disagreement",
        "Figure out how to reconnect with {person}",
        "Decide whether to confront {person} about the issue",
        "Choose how to respond to {person}'s request",
        "Figure out the right way to apologize to {person}",
        "Decide how to balance time between family and work",
        "Choose the best way to communicate concerns to {person}",
        "Figure out how to be more present for {person}",
        "Decide whether to forgive and move on",
        "Choose how to handle the family dynamics at {event}",
        "Figure out the best way to divide responsibilities with {person}",
        "Decide how to address the tension with {person}",
        "Choose the right time to have the conversation with {person}",
        "Figure out how to navigate the change in the friendship",
        "Decide whether to reach out to {person} again",
    ],
    "decide-education": [
        "Decide which course to take next",
        "Choose between certification programs",
        "Figure out the best training path for {skill}",
        "Decide on the right degree program",
        "Choose between online and in-person learning",
        "Decide whether to pursue the {skill} certification",
        "Figure out the best way to learn {skill}",
        "Choose between {course} options",
        "Decide on the right school for the program",
        "Figure out whether an MBA is worth it",
        "Choose the best continuing education path",
        "Decide between self-study and formal training",
        "Figure out the right pace for the coursework",
        "Choose the best learning platform for {skill}",
        "Decide whether to invest in {course}",
        "Figure out if the boot camp is worth the cost",
        "Choose between the two graduate programs",
        "Decide on the right electives to take",
        "Figure out the best way to prepare for the certification",
        "Choose between full-time and part-time study",
    ],
    "decide-priority": [
        "Decide what to focus on this quarter",
        "Choose which project to tackle first",
        "Figure out the best time allocation this week",
        "Decide between {project} and the other priorities",
        "Choose which goals to prioritize this year",
        "Figure out what to drop from the schedule",
        "Decide the order of upcoming projects",
        "Choose between depth and breadth this month",
        "Figure out the top three priorities for {date}",
        "Decide whether to focus on {topic} or {topic}",
        "Choose the most important tasks for the week",
        "Figure out how to balance all the commitments",
        "Decide what to delegate and what to keep",
        "Choose between short-term wins and long-term goals",
        "Figure out the right order for the renovation phases",
        "Decide which areas need attention first",
        "Choose between personal and professional development",
        "Figure out the priority among competing deadlines",
        "Decide what to say no to this month",
        "Choose the right balance of work and personal goals",
    ],
}


# ---------------------------------------------------------------------------
# Ambiguous borderline examples (15-20%)
# ---------------------------------------------------------------------------
AMBIGUOUS_EXAMPLES = [
    # Task-like but could be multiple categories
    ("I need to deal with the {fixture} situation", "repair-fix"),
    ("The {room} really needs some attention", "organize-space"),
    ("Should probably do something about {pet}'s health", "pet-care"),
    ("The trip to {city} needs planning", "plan-trip"),
    ("Time to get serious about fitness", "fitness-goal"),
    ("Need to sort out the finances", "financial-task"),
    ("The {room} project is overdue", "home-improvement"),
    ("Have to figure out the food situation for the week", "meal-prep"),
    ("The kids' schedule is getting complicated", "childcare-parenting"),
    ("{vehicle} is making a weird noise", "maintenance-routine"),
    ("Should reach out to {person} soon", "communication-task"),
    ("The {space} is getting out of control", "organize-space"),
    ("Need to get {pet} taken care of", "pet-care"),
    ("Time for a career change maybe", "career-move"),
    ("The house needs some work done", "home-improvement"),
    ("Should start looking at new places", "moving-relocate"),
    ("Need to get the health stuff handled", "medical-health"),
    ("Time to clean up the digital mess", "digital-cleanup"),
    # Decision-like but could be multiple categories
    ("Not sure what to do about the {software} situation", "decide-technology"),
    ("Torn between the two options for the house", "decide-living"),
    ("Can't decide on the right approach for {treatment}", "decide-health"),
    ("Struggling with the career decision", "decide-career"),
    ("Need to figure out the money situation", "decide-financial"),
    ("Unsure which service to go with", "decide-service"),
    ("Weighing the options for the purchase", "decide-purchase"),
    ("Trying to figure out what matters most right now", "decide-priority"),
    ("Not sure how to handle things with {person}", "decide-relationship"),
    ("Debating whether to take {course}", "decide-education"),
    # Cross-category ambiguity
    ("Get the {room} ready for the party", "plan-event"),
    ("Need to buy stuff for the trip to {city}", "plan-trip"),
    ("Should I fix it myself or hire someone", "decide-service"),
    ("Figure out the best gym situation", "fitness-goal"),
    ("The volunteer thing needs attention", "volunteer-community"),
    ("Gift for {recipient} is overdue", "gift-giving"),
    ("The {subscription} situation needs sorting out", "administrative"),
    ("Running errands this weekend", "errand-run"),
    ("Time to prepare for the interview", "career-move"),
    ("Need to make a plan for the content", "create-content"),
    ("Probably should get the kids signed up for something", "childcare-parenting"),
    ("The social calendar is empty", "social-plan"),
    ("Time to actually learn {skill}", "learn-skill"),
    ("Should fill out that application already", "complete-application"),
    ("The maintenance stuff is piling up", "maintenance-routine"),
]


# ---------------------------------------------------------------------------
# Generation logic
# ---------------------------------------------------------------------------
def generate(count_per_label: int, output_path: Path) -> None:
    """Generate training data for all decomposition pattern categories."""
    # Merge task and decision templates
    all_templates = {}
    all_templates.update(TASK_TEMPLATES)
    all_templates.update(DECISION_TEMPLATES)

    labels = sorted(all_templates.keys())
    num_labels = len(labels)

    # Calculate ambiguous count (15-20% of total)
    total_regular = count_per_label * num_labels
    ambiguous_ratio = 0.17  # ~17% ambiguous
    ambiguous_count_target = int(total_regular * ambiguous_ratio / (1 - ambiguous_ratio))

    samples = []

    # Generate regular samples
    for label in labels:
        label_templates = all_templates[label]
        for i in range(count_per_label):
            template = label_templates[i % len(label_templates)]
            text = fill_template(template)
            samples.append({"text": text, "label": label})

    # Generate ambiguous samples
    for i in range(ambiguous_count_target):
        template, label = AMBIGUOUS_EXAMPLES[i % len(AMBIGUOUS_EXAMPLES)]
        text = fill_template(template)
        samples.append({"text": text, "label": label})

    # Shuffle
    random.shuffle(samples)

    # Write JSONL
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample) + "\n")

    # Statistics
    label_counts = {}
    for s in samples:
        label_counts[s["label"]] = label_counts.get(s["label"], 0) + 1

    print(f"\n=== Decomposition Data Statistics ===")
    print(f"Output: {output_path}")
    print(f"Total samples: {len(samples)}")
    print(f"Labels ({num_labels}):")

    task_count = 0
    decision_count = 0
    for label in labels:
        count = label_counts.get(label, 0)
        pct = count / len(samples) * 100
        category = "TASK" if label in TASK_TEMPLATES else "DECISION"
        if label in TASK_TEMPLATES:
            task_count += count
        else:
            decision_count += count
        print(f"  [{category}] {label}: {count} ({pct:.1f}%)")

    ambiguous_total = len(samples) - total_regular
    print(f"\nTask pattern samples: {task_count}")
    print(f"Decision pattern samples: {decision_count}")
    print(f"Ambiguous examples: {ambiguous_total} ({ambiguous_total / len(samples) * 100:.1f}%)")

    # Sample preview
    print(f"\n=== Sample Preview (first 5) ===")
    for i, sample in enumerate(samples[:5]):
        print(f"  [{i}] ({sample['label']}) {sample['text']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic decomposition pattern training data",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(OUTPUT_DIR / "decomposition.jsonl"),
        help="Output JSONL file path (default: scripts/training-data/decomposition.jsonl)",
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

    output_path = Path(args.output)
    print(f"Output: {output_path}")
    print(f"Count per label: {args.count}")

    generate(args.count, output_path)


if __name__ == "__main__":
    main()
