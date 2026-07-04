import { db, schema } from "./index";
import { hashPin } from "../lib/auth";

const DEFAULT_PIN = "0000";

const people = [
  { name: "Aditha Pinsara", displayOrder: 1 },
  { name: "Pahasara Dinal", displayOrder: 2 },
  { name: "Ravishka Wijerathne", displayOrder: 3 },
];

for (const person of people) {
  db.insert(schema.persons)
    .values({ ...person, pinHash: hashPin(DEFAULT_PIN) })
    .onConflictDoNothing()
    .run();
}

console.log(
  `Seeded ${people.length} people (default PIN ${DEFAULT_PIN} — change it in Settings).`,
);
