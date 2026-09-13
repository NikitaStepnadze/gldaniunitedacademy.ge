/**
 * Seeds the events table with the entries the theme shipped with.
 *
 * Two of them are the schedule cards that used to sit in the home page's events
 * section; the other four are the blog posts from the news section, which has
 * moved to /news. Both sets were hardcoded markup in content/pages/index.html,
 * editable only through per-element CMS rows -- enough to reword a card, not to
 * add one. They are rows now, so the copy has to move into the table once;
 * otherwise a site that upgrades finds both lists empty, having lost six cards
 * that were never anyone's to delete.
 *
 * Idempotent: an entry whose slug already has a row is left alone, so a re-run
 * never overwrites an admin's edits and never inserts a duplicate. Run it after
 * `npm run appwrite:migrate`.
 *
 *   npm run appwrite:seed-news
 */
import { config } from 'dotenv';
import { Client, TablesDB, Query, ID } from 'node-appwrite';

config({ quiet: true });

const endpoint =
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'academy';
const EVENTS_TABLE = process.env.APPWRITE_EVENTS_TABLE_ID ?? 'events';

if (!projectId || !apiKey) {
  console.error('Missing config. Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and APPWRITE_API_KEY');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const tablesDB = new TablesDB(client);

/*
 * The six entries, copied from the markup they used to live in.
 *
 * `image` is left empty rather than pointed at the theme's files: an empty
 * value means "use the theme's own photo", which is what the card renderer
 * falls back to. Storing the path would freeze today's default into the
 * database and make a later theme change invisible.
 *
 * The slugs are written out rather than derived, because they are URLs:
 * leaving them to a function means a change to that function silently changes
 * every link that was ever shared.
 *
 * The two events are flagged `featured`, since they are the pair the home page
 * showed before this change -- an upgrade should leave that section looking
 * exactly as it did. The news posts carry no flag: the home page no longer has
 * a section for them.
 *
 * `body` is written here because these entries now have pages of their own, and
 * a page holding nothing but its own headline is worse than no page at all --
 * it is a thin result a crawler will hold against the site. The text expands on
 * what each card already promised rather than inventing new facts: the events
 * restate their own place, date and terms, and the four posts give the advice
 * their headlines offer. An admin edits any of it in the panel.
 */
const ENTRIES = [
  {
    slug: 'zapkhulis-sapekhburto-banaki',
    kind: 'event',
    title: 'ზაფხულის საფეხბურთო ბანაკი',
    location: 'აკადემიის მოედანი, გლდანი',
    date: '20 სექტემბერი',
    time: 'დაწყება 11:00 საათზე',
    priceLabel: 'მონაწილეობა',
    priceValue: 'უფასო',
    ctaLabel: 'გაიგე მეტი',
    excerpt:
      'ზაფხულის ბანაკი აკადემიის მოედანზე — ვარჯიში, მინი-ტურნირები და გასართობი აქტივობები 5-16 წლის ბავშვებისთვის. მონაწილეობა უფასოა.',
    body: `ზაფხულის საფეხბურთო ბანაკი აკადემიის მოედანზე იმართება და ყველა ასაკობრივ ჯგუფს აერთიანებს. მონაწილეობა უფასოა და წინასწარი მომზადება საჭირო არ არის.

დღის განრიგი სამი ნაწილისგან შედგება: სავარჯიშო ბლოკი მწვრთნელებთან, მინი-ტურნირი შერეულ გუნდებში და გასართობი აქტივობები. ჯგუფები ასაკის მიხედვით იყოფა, ისე რომ ყველა ბავშვი თავის დონეზე თამაშობს.

თან წამოიღეთ სავარჯიშო ფორმა, ბუცები და წყალი. მოედანზე მშობლებისთვის დასაჯდომი ადგილებია.

დამატებითი კითხვებისთვის დაგვიკავშირდით — ადგილების რაოდენობა შეზღუდულია, ამიტომ წინასწარ შემოწმება გირჩევთ.`,
    image: '',
    featured: true,
    published: true,
    order: 1,
  },
  {
    slug: 'gldanis-sabavshvo-tasi',
    kind: 'event',
    title: 'გლდანის საბავშვო თასი',
    location: 'აკადემიის მოედანი, გლდანი',
    date: '20 სექტემბერი',
    time: 'დაწყება 11:00 საათზე',
    priceLabel: 'მონაწილეობა',
    priceValue: 'უფასო',
    ctaLabel: 'გაიგე მეტი',
    excerpt:
      'ერთდღიანი ტურნირი გლდანის ჯგუფებისთვის — ჯგუფური ეტაპი, ფინალი და დაჯილდოება. მონაწილეობა უფასოა.',
    body: `გლდანის საბავშვო თასი ერთდღიანი ტურნირია, რომელშიც უბნის რამდენიმე ჯგუფი მონაწილეობს. მონაწილეობა უფასოა.

ტურნირი ჯგუფური ეტაპით იწყება, შემდეგ საუკეთესო გუნდები ფინალურ შეხვედრებზე გადადიან. მატჩები შემოკლებული დროით ტარდება, რომ თითოეულ გუნდს რამდენიმე თამაში ჰქონდეს.

დღის ბოლოს იმართება დაჯილდოება: მედლები ყველა მონაწილეს, თასი გამარჯვებულ გუნდს.

გუნდის დარეგისტრირებისთვის ან დამატებითი ინფორმაციისთვის დაგვიკავშირდით.`,
    image: '',
    featured: true,
    published: true,
    order: 2,
  },
  {
    slug: 'rogor-movamzadot-bavshvi-pirveli-varjishistvis',
    kind: 'news',
    title: 'როგორ მოვამზადოთ ბავშვი პირველი ვარჯიშისთვის',
    tag: 'ვარჯიში',
    author: 'ავტორი: აკადემია',
    date: '12 სექტემბერი',
    ctaLabel: 'დეტალურად',
    excerpt:
      'პირველი ვარჯიში ბავშვისთვისაც და მშობლისთვისაც ნერვიულია. რამდენიმე მარტივი რამ, რაც დღეს გაცილებით მშვიდს გახდის.',
    body: `პირველი ვარჯიში ბავშვისთვის ახალი გარემოა: უცნობი ბავშვები, უცნობი მწვრთნელი და წესები, რომლებიც ჯერ არ იცის. მომზადება ძირითადად იმაზეა, რომ ეს უცნობი ნაკლებად საშიში გახდეს.

აუხსენით, რა მოხდება. მოკლედ უთხარით, სად მიდიხართ, რამდენ ხანს დარჩება და რომ თქვენ იქვე იქნებით. მოულოდნელობა უფრო ანერვიულებს, ვიდრე თავად ვარჯიში.

მოამზადეთ ნივთები ერთად. ფორმა, ბუცები, წყლის ბოთლი და პატარა პირსახოცი. როცა ბავშვი თვითონ აწყობს ჩანთას, ვარჯიში უკვე მისი საქმე ხდება და არა თქვენი.

მოდით ადრე. 10-15 წუთით ადრე მისვლა აძლევს დროს, გაეცნოს მოედანს სხვების მოსვლამდე. ბოლო წუთს ჩარბენა ყველაზე ხშირი მიზეზია ცრემლების.

ნუ დაპირდებით შედეგს. „კარგად ითამაშე" პირველ დღეს ზედმეტი ტვირთია. სჯობს: „ნახე, მოგეწონება თუ არა".

პირველ ვარჯიშზე ბავშვების ნაწილი მაშინვე ერთვება, ნაწილი კი ჯერ გვერდიდან უყურებს. ორივე ნორმალურია და ორივე ერთნაირად ხშირია.`,
    image: '',
    featured: false,
    published: true,
    order: 3,
  },
  {
    slug: 'stsori-kveba-mozardi-pekhburtelistvis',
    kind: 'news',
    title: 'სწორი კვება მოზარდი ფეხბურთელისთვის',
    tag: 'ტურნირი',
    author: 'ავტორი: აკადემია',
    date: '12 სექტემბერი',
    ctaLabel: 'დეტალურად',
    excerpt:
      'რა ჭამოს ბავშვმა ვარჯიშამდე და მის შემდეგ — პრაქტიკული პასუხები დიეტების გარეშე.',
    body: `მოზარდი ფეხბურთელის კვება განსაკუთრებულ დიეტას არ ნიშნავს. ის ჯერ კიდევ იზრდება, ამიტომ შეზღუდვები მეტ ზიანს აყენებს, ვიდრე სარგებელს. მთავარია დრო და თანმიმდევრობა.

ვარჯიშამდე 2-3 საათით ადრე — სრული კერძი: ბურღულეული ან მაკარონი, ცილა და ბოსტნეული. ეს ის საკვებია, რომელიც ენერგიას თანდათან გასცემს.

ვარჯიშამდე 30-60 წუთით ადრე — მხოლოდ მსუბუქი რამ: ხილი, პური თაფლით, იოგურტი. მძიმე საკვები ამ დროს მოძრაობას უშლის ხელს.

ვარჯიშის შემდეგ პირველ საათში — ცილა და ნახშირწყლები ერთად: რძის პროდუქტი, კვერცხი, ქათამი ბრინჯთან. ამ დროს ორგანიზმი აღდგენას იწყებს.

წყალი მთელი დღე. ბავშვები ვარჯიშის დროს იშვიათად გრძნობენ წყურვილს მანამ, სანამ უკვე გვიანი არ არის. ჩანთაში ბოთლი ყოველთვის უნდა ეყოს.

რაც შეეხება ტკბილეულს და გაზიან სასმელებს — სრული აკრძალვა საჭირო არ არის, მაგრამ ვარჯიშამდე ისინი ენერგიას ჯერ სწრაფად სწევს, შემდეგ კი ისევე სწრაფად აგდებს.`,
    image: '',
    featured: false,
    published: true,
    order: 4,
  },
  {
    slug: 'ras-vastsavlit-5-8-tslis-jgupshi',
    kind: 'news',
    title: 'რას ვასწავლით 5-8 წლის ჯგუფში',
    tag: 'ვარჯიში',
    author: 'ავტორი: აკადემია',
    date: '12 სექტემბერი',
    ctaLabel: 'დეტალურად',
    excerpt:
      'ყველაზე პატარა ჯგუფში ტექნიკა მთავარი არ არის. აი, რაზე ვმუშაობთ სინამდვილეში.',
    body: `მშობლები ხშირად გვეკითხებიან, რატომ თამაშობენ პატარები ვარჯიშის დიდ ნაწილს, ნაცვლად იმისა, რომ სავარჯიშოები გააკეთონ. პასუხი მარტივია: ამ ასაკში სწორედ თამაშია სავარჯიშო.

კოორდინაცია და მოძრაობა. სირბილი, ხტომა, მიმართულების შეცვლა, წონასწორობა. ეს უნარები ფეხბურთს სცილდება და მოგვიანებით ყველა ტექნიკური ელემენტის საფუძველი ხდება.

ბურთთან პირველი შეხება. ბურთის გაჩერება, წაყვანა, მარტივი დარტყმა. აქცენტი რაოდენობაზეა — რაც მეტჯერ შეეხება ბავშვი ბურთს, მით უფრო ბუნებრივი ხდება მოძრაობა.

ჯგუფური გარემო. რიგში დგომა, მწვრთნელის მოსმენა, თანატოლთან ბურთის გაზიარება. პირველ თვეებში ეს ხშირად უფრო რთულია, ვიდრე ნებისმიერი ტექნიკური ელემენტი.

მოგებისა და წაგების გადატანა. მინი-თამაშები სწორედ ამისთვისაა. სწავლობენ, რომ წაგება დღის დასასრული არ არის.

რაც ამ ასაკში შეგნებულად არ კეთდება: პოზიციებზე მკაცრი მიმაგრება, ტაქტიკური სქემები და ფიზიკური დატვირთვა გამძლეობაზე. ეს ყველაფერი მოგვიანებით მოდის და უფრო სწრაფად ითვისება, თუ საფუძველი სწორად ჩაიყარა.`,
    image: '',
    featured: false,
    published: true,
    order: 5,
  },
  {
    slug: 'rogor-avirchiot-pirveli-butsebi',
    kind: 'news',
    title: 'როგორ ავირჩიოთ პირველი ბუცები',
    tag: 'ვარჯიში',
    author: 'ავტორი: აკადემია',
    date: '12 სექტემბერი',
    ctaLabel: 'დეტალურად',
    excerpt:
      'ზომა, საფარი და მასალა — რაზე უნდა მიაქციოთ ყურადღება და რაზე ნამდვილად არა.',
    body: `პირველი ბუცების არჩევისას ორი შეცდომა ყველაზე ხშირია: ზრდაზე ყიდვა და საფარის უგულებელყოფა.

ზომა. ბუცი ფეხს მჭიდროდ უნდა ეცვას — თითის წვერსა და ბუცის ბოლოს შორის დაახლოებით ნახევარი სანტიმეტრი. „ზრდაზე" ერთი ან ორი ზომით დიდი ბუცი ფეხს ბუცის შიგნით ასრიალებს, რაც ბზარებს და არასწორ მოძრაობას იწვევს.

საფარი. ჩვენს მოედანზე FG (მყარი გრუნტი) ან AG (ხელოვნური საფარი) ტიპის ბუცი გამოდგება. დარბაზისთვის განკუთვნილი ბრტყელძირიანი ბუცი ბალახზე ცურავს.

მასალა. პატარებისთვის სინთეტიკური მასალა სავსებით საკმარისია: ის იაფია, სწრაფად შრება და ბავშვი მას ერთ სეზონზე მეტს ისედაც ვერ ატარებს. ტყავი მოგვიანებით, უფროს ჯგუფებში.

რაზე არ ღირს ფიქრი. პროფესიონალების მოდელები, მსუბუქი წონა და ბრენდი ამ ეტაპზე მნიშვნელობას არ ატარებს. სასურველია მარტივი, კომფორტული და სწორი ზომის ბუცი.

გაზომეთ ფეხი საღამოს, როცა ის ოდნავ შეშუპებულია, და მოზომეთ იმ წინდით, რომლითაც ბავშვი ივარჯიშებს.`,
    image: '',
    featured: false,
    published: true,
    order: 6,
  },
];

/ Every slug already in the table, so a re-run inserts nothing twice. */
async function existingSlugs() {
  const slugs = new Set();
  let cursor;

  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await tablesDB.listRows({
      databaseId,
      tableId: EVENTS_TABLE,
      queries,
    });
    for (const row of page.rows) slugs.add(row.slug);

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  return slugs;
}

console.log(`\nSeeding news and events -> ${endpoint} (project ${projectId})\n`);

const present = await existingSlugs();
let created = 0;
let kept = 0;

for (const entry of ENTRIES) {
  if (present.has(entry.slug)) {
    kept += 1;
    console.log(`  . ${entry.slug} (already exists)`);
    continue;
  }

  await tablesDB.createRow({
    databaseId,
    tableId: EVENTS_TABLE,
    rowId: ID.unique(),
    data: entry,
  });
  created += 1;
  console.log(`  + ${entry.slug}`);
}

console.log(`\n  ${created} added, ${kept} left untouched\n`);
console.log('Done.\n');
