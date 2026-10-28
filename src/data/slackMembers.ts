// Members of the #airvet-advisors Slack channel, matched to advisors by email.
// The dashboard can't call Slack directly, so this list is refreshed by hand:
// ask Claude to re-pull the channel, then push the updated file.
//
// Emails are the advisor's email as stored in HubSpot (lowercase). Three members use a
// different email in Slack, so they were matched by name and their HubSpot email is listed:
//   Rana Robillard (no Slack email)  -> rana@tekion.com
//   Sarah Pils (no Slack email)      -> sarah.pils@progyny.com
//   Tracy Cote (Slack: slickdeals)   -> tracy@tracycote.com

export const SLACK_SYNCED_AT = "2026-10-27";

export const SLACK_MEMBER_EMAILS: string[] = [
  "ashley.goldsmith@workday.com",
  "sabrina.becker@jacobs.com",
  "slmelche@comcast.net",
  "kyduncan@expediagroup.com",
  "nishita.sethna@braze.com",
  "rana@tekion.com",
  "tracy@tracycote.com",
  "ralbert@lyrahealth.com",
  "angela.cheng-cimini@philanthropy.com",
  "sarah.pils@progyny.com",
  "chad.winer@gong.io",
  "galacticbenefitleader@gmail.com",
  "tamibrosen@gmail.com",
  "brent.smith@snowflake.com",
  "tonjackson01@gmail.com",
  "baklott@comcast.net",
  "jasonrisoli@yahoo.com",
  "jason.russell@churchdwight.com",
  "stacyhisman@gmail.com",
  "tseafort@gmail.com",
  "deanrosalva@gmail.com",
  "sharontroost.brand@gmail.com",
  "willie.nickel@gmail.com",
  "anjelicagarcia@gmail.com",
  "anna@courie.com",
  "tamarabrownhrleader@gmail.com",
  "timothyhourigan@hotmail.com",
  "forrest.whyte@automationanywhere.com",
  "nunesadvisory@gmail.com",
  "sean.dineen@hoya.com",
  "keyantee.davis@trinity-health.org",
  "fjestrada@gmail.com",
  "bhavani.pandi@gmail.com",
  "jordan.backman@gmail.com",
  "ryancoslett@gmail.com",
  "bruce.monte@yale.edu",
  "kacy@kacyfleming.com",
  "gianettajones@ccbcu.com",
  "mike.stover@pchresorts.com",
];

const SET = new Set(SLACK_MEMBER_EMAILS);

export function isInSlack(email: string | null | undefined): boolean {
  return !!email && SET.has(email.trim().toLowerCase());
}
