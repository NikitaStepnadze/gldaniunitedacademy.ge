/**
 * Seeds the programmes table with the three age groups the theme shipped with.
 *
 * These used to be hardcoded cards in content/pages/index.html, editable only
 * through per-element CMS rows. They are rows now, so the copy has to move into
 * the table once -- otherwise a site that upgrades finds its programmes section
 * empty, having lost three cards that were never anyone's to delete.
 *
 * Idempotent: a programme whose slug already has a row is left alone, so a
 * re-run never overwrites an admin's edits and never inserts a duplicate. Run
 * it after `npm run appwrite:migrate`.
 *
 *   npm run appwrite:seed-programs
 */
import { config } from 'dotenv';
import { Client, TablesDB, Query, ID } from 'node-appwrite';

config({ quiet: true });

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';
const PROGRAMS_TABLE = process.env.APPWRITE_PROGRAMS_TABLE_ID ?? 'programs';

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);

/*
 * The three programmes, copied from the markup they used to live in.
 *
 * `image` is left empty rather than pointed at the theme's files: an empty
 * value means "use the theme's own photo for this position", which is what the
 * card renderer falls back to. Storing the path would freeze today's default
 * into the database and make a later theme change invisible.
 *
 * The slugs are written out rather than derived, because they are URLs: leaving
 * them to a function means a change to that function silently changes every
 * link that was ever shared.
 *
 * They are short English words rather than a transliteration of the Georgian
 * title. `slugify` would produce something faithful but unwieldy
 * ("damtsqebta-jgupi-pirveli-nabijebi-pekhburtshi"); these three are the
 * academy's permanent age ladder, so they earn hand-picked names that stay
 * short in a shared link. A programme added later gets the transliteration as
 * its default and can be renamed in the editor.
 */
const PROGRAMS = [
  {
    slug: 'beginners',
    title: 'დამწყებთა ჯგუფი — პირველი ნაბიჯები ფეხბურთში',
    ageRange: '5-8',
    ageUnit: 'წელი',
    activityLabel: 'ვარჯიში',
    frequency: 'კვირაში 3-ჯერ',
    description:
      'თამაშზე დაფუძნებული ვარჯიში: ბურთთან დაახლოება, კოორდინაცია და მოძრაობის კულტურა. მთავარი მიზანია, ბავშვს შეუყვარდეს ფეხბურთი.',
    body: `ამ ასაკში მთავარი მიზანი ტექნიკური სრულყოფა არ არის — მთავარია, ბავშვმა შეიყვაროს ბურთი და მოძრაობა. ვარჯიში მთლიანად თამაშზეა აგებული.

ვმუშაობთ კოორდინაციაზე, წონასწორობაზე და ბურთთან პირველ შეხებაზე. პარალელურად ბავშვი ეჩვევა გუნდურ გარემოს: რიგის დაცვას, მწვრთნელის მოსმენას და თანატოლებთან თანამშრომლობას.

ჯგუფში მიღება მიმდინარეობს მთელი წლის განმავლობაში, წინასწარი მომზადება საჭირო არ არის.`,
    image: '',
    featured: true,
    published: true,
    order: 1,
  },
  {
    slug: 'foundation',
    title: 'საბაზისო ჯგუფი — ტექნიკა და გუნდური თამაში',
    ageRange: '9-12',
    ageUnit: 'წელი',
    activityLabel: 'ვარჯიში',
    frequency: 'კვირაში 3-ჯერ',
    description:
      'ბურთის დაუფლება, პასის სიზუსტე და პოზიციური გაგება. ამ ეტაპზე ბავშვები იწყებენ მონაწილეობას ტურნირებში.',
    body: `საბაზისო ეტაპზე ვმუშაობთ ტექნიკის საფუძვლებზე: ბურთის მართვა, პასის სიზუსტე, დარტყმა და პირველი შეხება.

ბავშვები ეცნობიან პოზიციებს და სწავლობენ მოედანზე სივრცის დანახვას — სად უნდა გადაადგილდნენ ბურთის გარეშე და როდის უნდა გადასცენ პასი.

ამ ასაკიდან ჯგუფი მონაწილეობს სასწავლო ტურნირებსა და ამხანაგურ შეხვედრებში, სადაც ნასწავლი უკვე რეალურ თამაშში მოწმდება.`,
    image: '',
    featured: true,
    published: true,
    order: 2,
  },
  {
    slug: 'development',
    title: 'სასწავლო ჯგუფი — ტაქტიკა და ფიზიკური მომზადება',
    ageRange: '13-16',
    ageUnit: 'წელი',
    activityLabel: 'ვარჯიში',
    frequency: 'კვირაში 3-ჯერ',
    description:
      'ტაქტიკური მომზადება, ფიზიკური განვითარება და სათამაშო პრაქტიკა. ჯგუფი მონაწილეობს ოფიციალურ ჩემპიონატებში.',
    body: `უფროს ჯგუფში აქცენტი ტაქტიკასა და ფიზიკურ მომზადებაზე გადადის. ვმუშაობთ გუნდურ სქემებზე, პრესინგზე და თავდაცვის ორგანიზებაზე.

ფიზიკური მომზადება ასაკის შესაბამისია: გამძლეობა, სისწრაფე და ძალა ვითარდება თანდათან, ტრავმების პრევენციაზე ორიენტირებული პროგრამით.

ჯგუფი მონაწილეობს ოფიციალურ ჩემპიონატებში, სადაც მოთამაშეები რეგულარულ სათამაშო პრაქტიკას იღებენ.`,
    image: '',
    featured: true,
    published: true,
    order: 3,
  },
];

/** Every slug already in the table, so a re-run inserts nothing twice. */
async function existingSlugs() {
  const slugs = new Set();
  let cursor;

  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({
      databaseId,
      tableId: PROGRAMS_TABLE,
      queries,
    });
    for (const row of page.rows) slugs.add(row.slug);

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return slugs;
}

console.log(`\nSeeding programmes -> ${endpoint} (project ${projectId})\n`);

const present = await existingSlugs();
let created = 0;
let kept = 0;

for (const program of PROGRAMS) {
  if (present.has(program.slug)) {
    kept += 1;
    console.log(`  . ${program.slug} (already exists)`);
    continue;
  }

  await tablesDB.createRow({
    databaseId,
    tableId: PROGRAMS_TABLE,
    rowId: ID.unique(),
    data: program,
  });
  created += 1;
  console.log(`  + ${program.slug}`);
}

console.log(`\n  ${created} added, ${kept} left untouched\n`);
console.log('Done.\n');
