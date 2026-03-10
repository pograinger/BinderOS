/**
 * Question bank for semantic follow-up selection.
 *
 * Large pool of questions per category, used at depth 3+ when template tiers
 * are exhausted. The semantic selector embeds these and picks the most
 * distant from previously asked questions.
 *
 * Each question uses {prior_answer} for slot-filling with the user's latest answer.
 *
 * Pure data module — no imports, no side effects.
 *
 * Phase 25: ITER-01
 */

import type { MissingInfoCategory } from '../clarification/types';

export interface QuestionBankEntry {
  question: string;
  options: string[];
}

/**
 * Question bank: ~15 diverse questions per category covering different angles.
 * Designed for maximum semantic spread so the selector always finds something novel.
 */
export const QUESTION_BANK: Record<MissingInfoCategory, QuestionBankEntry[]> = {
  'missing-outcome': [
    {
      question: 'What would change in your life once "{prior_answer}" is done?',
      options: ['A specific problem goes away', 'A new capability opens up', 'Peace of mind'],
    },
    {
      question: 'Who else benefits when "{prior_answer}" is achieved?',
      options: ['My team or family', 'Just me', 'A client or stakeholder'],
    },
    {
      question: 'If "{prior_answer}" only partially succeeds, what\'s the minimum acceptable result?',
      options: ['The core problem is solved', 'Enough to move to the next step', 'Any progress counts'],
    },
    {
      question: 'What would you celebrate about "{prior_answer}"?',
      options: ['Finishing it at all', 'The quality of the result', 'How fast it got done'],
    },
    {
      question: 'What\'s the opposite of "{prior_answer}" — what does failure look like?',
      options: ['Nothing changes', 'Things get worse', 'Wasted time and effort'],
    },
    {
      question: 'How does "{prior_answer}" connect to a bigger goal you have?',
      options: ['It\'s a stepping stone', 'It\'s the final piece', 'It\'s independent'],
    },
    {
      question: 'If you explained "{prior_answer}" to someone else, how would you describe the end state?',
      options: ['A tangible deliverable', 'A decision made', 'A habit or process established'],
    },
    {
      question: 'What assumptions are baked into "{prior_answer}"?',
      options: ['That I have the resources', 'That the timeline is realistic', 'That the approach is right'],
    },
    {
      question: 'What\'s the first sign that "{prior_answer}" is on track?',
      options: ['An early milestone hit', 'Positive feedback received', 'No blockers encountered'],
    },
    {
      question: 'Is "{prior_answer}" something you\'d want to do again, or is it one-and-done?',
      options: ['One-time effort', 'Recurring process', 'Template for future work'],
    },
    {
      question: 'What emotion do you associate with completing "{prior_answer}"?',
      options: ['Relief', 'Excitement', 'Satisfaction', 'Indifference'],
    },
    {
      question: 'How would you prioritize "{prior_answer}" against your other goals?',
      options: ['Top priority', 'Important but not urgent', 'Nice to have'],
    },
  ],
  'missing-next-action': [
    {
      question: 'What\'s stopping you from doing "{prior_answer}" right now?',
      options: ['Nothing — I could start now', 'Waiting on someone else', 'Need more information'],
    },
    {
      question: 'Can "{prior_answer}" be broken into smaller steps?',
      options: ['Yes, at least 2-3 sub-steps', 'It\'s already atomic', 'Maybe, but it\'s not worth it'],
    },
    {
      question: 'What\'s the very first physical movement for "{prior_answer}"?',
      options: ['Open an app or tool', 'Pick up the phone', 'Write something down', 'Go somewhere'],
    },
    {
      question: 'If you handed "{prior_answer}" to someone else, what instructions would you give?',
      options: ['Very specific steps', 'General direction, they\'d figure it out', 'I\'d need to show them'],
    },
    {
      question: 'How will you know "{prior_answer}" is complete vs. still in progress?',
      options: ['Clear done criteria', 'I\'ll feel it\'s enough', 'Someone will confirm'],
    },
    {
      question: 'What energy level does "{prior_answer}" require?',
      options: ['High focus', 'Moderate attention', 'Can do on autopilot'],
    },
    {
      question: 'Is "{prior_answer}" best done alone or with someone?',
      options: ['Solo task', 'Need one other person', 'Group effort'],
    },
    {
      question: 'What could go wrong with "{prior_answer}" and how would you recover?',
      options: ['Low risk, easy to retry', 'Moderate risk, have a backup', 'High risk, no undo'],
    },
    {
      question: 'Is there a way to test or validate "{prior_answer}" before fully committing?',
      options: ['Do a small trial first', 'Ask someone for feedback', 'Just go for it'],
    },
    {
      question: 'What would make "{prior_answer}" easier or faster?',
      options: ['Better tools', 'Help from someone', 'Fewer distractions', 'More information'],
    },
    {
      question: 'When during the day would "{prior_answer}" be most effective?',
      options: ['Morning — fresh mind', 'Afternoon — warmed up', 'Evening — fewer interruptions'],
    },
    {
      question: 'Does "{prior_answer}" have a natural stopping point if you run out of time?',
      options: ['Yes, I can pause mid-way', 'No, it\'s all or nothing', 'I can save partial progress'],
    },
  ],
  'missing-timeframe': [
    {
      question: 'What happens if "{prior_answer}" passes without finishing?',
      options: ['Opportunity lost', 'Just reschedule', 'Others are impacted'],
    },
    {
      question: 'Is "{prior_answer}" driven by your own preference or an external requirement?',
      options: ['Self-imposed', 'External deadline', 'Mix of both'],
    },
    {
      question: 'Could "{prior_answer}" be moved earlier if you had free time?',
      options: ['Yes, sooner is better', 'No, it depends on other things', 'Doesn\'t matter when'],
    },
    {
      question: 'What needs to happen before "{prior_answer}"?',
      options: ['Nothing — it\'s independent', 'Another task must finish first', 'Waiting on information'],
    },
    {
      question: 'Is there a recurring pattern to "{prior_answer}"?',
      options: ['One-time event', 'Weekly/monthly cycle', 'Seasonal or annual'],
    },
    {
      question: 'How much buffer time would you want before "{prior_answer}"?',
      options: ['None needed', 'A day or two', 'A week to prepare'],
    },
    {
      question: 'Would you set a reminder for "{prior_answer}"?',
      options: ['Yes, on the day', 'Yes, a few days before', 'No, I\'ll remember'],
    },
    {
      question: 'What would cause "{prior_answer}" to shift?',
      options: ['Higher priority work', 'External dependency change', 'My own energy level'],
    },
    {
      question: 'Is "{prior_answer}" the start date, deadline, or target?',
      options: ['Start date — begin by then', 'Deadline — must finish', 'Target — aim for it'],
    },
    {
      question: 'How did you arrive at "{prior_answer}" as the timeframe?',
      options: ['Gut feeling', 'Based on similar past experience', 'Someone set it', 'Calculated estimate'],
    },
    {
      question: 'If you could only spend 30 minutes on this, when would those 30 minutes be?',
      options: ['Today', 'Tomorrow morning', 'This weekend', 'Next available free slot'],
    },
    {
      question: 'Does "{prior_answer}" align with any other deadlines you have?',
      options: ['Yes, they\'re related', 'No, it\'s independent', 'It conflicts with something'],
    },
  ],
  'missing-context': [
    {
      question: 'What mental state works best for "{prior_answer}"?',
      options: ['Focused and alert', 'Relaxed and creative', 'Doesn\'t matter'],
    },
    {
      question: 'Does "{prior_answer}" require internet access?',
      options: ['Yes, essential', 'Helpful but not required', 'No, fully offline'],
    },
    {
      question: 'Could you do "{prior_answer}" while traveling or commuting?',
      options: ['Yes, it\'s mobile-friendly', 'Only on a laptop', 'Needs a specific location'],
    },
    {
      question: 'Is "{prior_answer}" noisy or disruptive to others?',
      options: ['Silent activity', 'Involves calls or talking', 'Might be messy or loud'],
    },
    {
      question: 'What would make "{prior_answer}" impossible today?',
      options: ['Missing a key tool', 'Wrong location', 'Too tired', 'Too many interruptions'],
    },
    {
      question: 'How much physical space does "{prior_answer}" require?',
      options: ['Just a phone screen', 'A desk and monitor', 'A room or workshop'],
    },
    {
      question: 'Is "{prior_answer}" weather-dependent?',
      options: ['Yes, need good weather', 'Indoor activity', 'Can adapt either way'],
    },
    {
      question: 'What\'s your backup plan if "{prior_answer}" isn\'t available?',
      options: ['Do something else instead', 'Wait until it\'s available', 'Adapt and do it differently'],
    },
    {
      question: 'How long of an uninterrupted block does "{prior_answer}" need?',
      options: ['5-10 minutes', '30 minutes', '1+ hours', 'Can be interrupted'],
    },
    {
      question: 'Are there other people typically present at "{prior_answer}"?',
      options: ['Usually alone', 'Others around but not involved', 'Collaborative setting'],
    },
    {
      question: 'What time of year or season is "{prior_answer}" most relevant?',
      options: ['Any time', 'Specific season', 'Tied to a schedule or calendar'],
    },
    {
      question: 'Does "{prior_answer}" require any special permissions or access?',
      options: ['No, freely accessible', 'Need credentials or keys', 'Need someone\'s approval'],
    },
  ],
  'missing-reference': [
    {
      question: 'Is there a past experience that informs how to handle "{prior_answer}"?',
      options: ['Yes, I\'ve done similar before', 'First time dealing with this', 'Someone else has experience'],
    },
    {
      question: 'Would a checklist or template help with "{prior_answer}"?',
      options: ['Yes, I should create one', 'One already exists', 'Too unique for a template'],
    },
    {
      question: 'Is there a conversation or email thread related to "{prior_answer}"?',
      options: ['Yes, I should link it', 'Not yet, but there will be', 'No, it\'s self-contained'],
    },
    {
      question: 'Does "{prior_answer}" connect to any ongoing project or area of responsibility?',
      options: ['Active project', 'Area of responsibility', 'Standalone item'],
    },
    {
      question: 'Who would be the expert to consult about "{prior_answer}"?',
      options: ['A specific person', 'An online community', 'Official documentation', 'No one — I\'m the expert'],
    },
    {
      question: 'Is there a budget or financial aspect to "{prior_answer}"?',
      options: ['Yes, has a cost', 'Free or already covered', 'Need to figure out cost'],
    },
    {
      question: 'What would you search for online to learn more about "{prior_answer}"?',
      options: ['Specific keywords', 'A tutorial or guide', 'Similar examples', 'Nothing — I know enough'],
    },
    {
      question: 'Is "{prior_answer}" documented somewhere you can point to?',
      options: ['Written notes exist', 'In my head only', 'Scattered across places'],
    },
    {
      question: 'Does "{prior_answer}" have version history or iterations?',
      options: ['Yes, this is v2+', 'First version', 'It evolves continuously'],
    },
    {
      question: 'What\'s the source of truth for "{prior_answer}"?',
      options: ['A specific document', 'A person\'s knowledge', 'An app or system', 'Not established yet'],
    },
    {
      question: 'Are there competing or alternative approaches to "{prior_answer}"?',
      options: ['Yes, I\'m choosing between options', 'This is the only way', 'Haven\'t explored alternatives'],
    },
    {
      question: 'Should "{prior_answer}" be shared with anyone for visibility?',
      options: ['Yes, specific people', 'Maybe later', 'No, it\'s private'],
    },
  ],
};
