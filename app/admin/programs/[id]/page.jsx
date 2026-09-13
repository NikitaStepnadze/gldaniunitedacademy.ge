import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { isAuthenticated } from '../../../../lib/appwrite/auth';
import { FEATURED_LIMIT, getProgramById } from '../../../../lib/appwrite/programs';

import FormImagePicker from '../../FormImagePicker';
import { deleteProgramAction, updateProgramAction } from '../actions';

export const dynamic = 'force-dynamic';

/** Banner for a failed save, keyed by the `error` the action redirects with. */
const ERRORS = {
  title: 'სათაური სავალდებულოა.',
};

/**
 * The programme editor.
 *
 * One plain form posted to a server action, rather than the live-preview editor
 * used for the theme's fixed text. That screen exists because its fields are
 * scattered across a page an admin needs to see; a programme is a single card
 * whose shape is already obvious from the labels, so a form is both simpler and
 * less to go wrong.
 */
export default async function ProgramEditorPage({ params, searchParams }) {
  if (!(await isAuthenticated())) redirect('/admin/login');

  const { id } = await params;
  const query = await searchParams;

  const program = await getProgramById(id);
  if (!program) notFound();

  const error = ERRORS[query?.error];
  const saved = query?.saved === '1';
  const created = query?.created === '1';

  // The action needs the row id, which a form payload does not carry.
  const save = updateProgramAction.bind(null, program.id);
  const remove = deleteProgramAction.bind(null, program.id);

  const href = `/programs/${encodeURIComponent(program.slug)}`;

  return (
    <main className="admin-main">
      <header className="admin-head">
        <h1 className="admin-title">{program.title}</h1>
        <p className="admin-subtitle">
          <Link href="/admin/programs">← ყველა პროგრამა</Link>
          {program.published && (
            <>
              {' · '}
              <a href={href} target="_blank" rel="noopener noreferrer">
                გვერდის ნახვა
              </a>
            </>
          )}
        </p>
      </header>

      {error && <p className="admin-msg error">{error}</p>}
      {created && <p className="admin-msg ok">პროგრამა შექმნილია. შეავსეთ დანარჩენი ველები.</p>}
      {saved && <p className="admin-msg ok">ცვლილებები შენახულია.</p>}

      <form action={save}>
        <section className="admin-panel">
          <h2>ძირითადი</h2>

          <div className="admin-field">
            <label htmlFor="title">სათაური</label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={200}
              defaultValue={program.title}
            />
            <p className="hint">ბარათზე და გვერდის სათაურში.</p>
          </div>

          {/*
            The URL, as its own field.

            Auto-generated from the title, but editable: the generated form is a
            transliteration ("damtsqebta-jgupi-pirveli-nabijebi-pekhburtshi"),
            which is honest but long, and a short English word makes a far
            better link to share.
          */}
          <div className="admin-field">
            <label htmlFor="slug">გვერდის მისამართი</label>
            <input
              id="slug"
              name="slug"
              type="text"
              maxLength={160}
              defaultValue={program.slug}
            />
            <p className="hint">
              <code>/programs/{program.slug}</code>
              <br />
              ლათინური ასოებით, ბმულის გასაზიარებლად. სათაურის შეცვლა მისამართს
              არ ცვლის. ცარიელი ველი — მისამართი ხელახლა აეწყობა სათაურიდან.
              <strong> გაითვალისწინეთ:</strong> შეცვლის შემდეგ ძველი ბმული აღარ
              იმუშავებს.
            </p>
          </div>

          <div className="admin-field-row">
            <div className="admin-field">
              <label htmlFor="ageRange">ასაკობრივი ჯგუფი</label>
              <input
                id="ageRange"
                name="ageRange"
                type="text"
                maxLength={40}
                placeholder="5-8"
                defaultValue={program.ageRange}
              />
              <p className="hint">ბარათზე დიდი ციფრი. ცარიელი — ნიშანი არ გამოჩნდება.</p>
            </div>

            <div className="admin-field">
              <label htmlFor="ageUnit">ასაკის ერთეული</label>
              <input
                id="ageUnit"
                name="ageUnit"
                type="text"
                maxLength={40}
                placeholder="წელი"
                defaultValue={program.ageUnit}
              />
              <p className="hint">ციფრის ქვეშ მეორე სტრიქონი.</p>
            </div>
          </div>

          <div className="admin-field-row">
            {/*
              The field this whole screen was added for. The theme printed
              "ვარჯიში" as fixed text next to its icon, so a programme that is a
              camp or a tournament had no way to say so.
            */}
            <div className="admin-field">
              <label htmlFor="activityLabel">აქტივობა</label>
              <input
                id="activityLabel"
                name="activityLabel"
                type="text"
                maxLength={80}
                placeholder="ვარჯიში"
                defaultValue={program.activityLabel}
              />
              <p className="hint">ბარათზე პირველი წარწერა ხატულასთან.</p>
            </div>

            <div className="admin-field">
              <label htmlFor="frequency">სიხშირე</label>
              <input
                id="frequency"
                name="frequency"
                type="text"
                maxLength={120}
                placeholder="კვირაში 3-ჯერ"
                defaultValue={program.frequency}
              />
              <p className="hint">ბარათზე მეორე წარწერა ხატულასთან.</p>
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="description">მოკლე აღწერა</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={2000}
              defaultValue={program.description}
            />
            <p className="hint">ბარათზე სათაურის ქვეშ და გვერდის შესავალში.</p>
          </div>
        </section>

        <section className="admin-panel">
          <h2>სურათი</h2>
          <div className="admin-field">
            <FormImagePicker name="image" defaultValue={program.image} />
            <p className="hint">ცარიელი — გამოჩნდება საწყისი სურათი.</p>
          </div>
        </section>

        <section className="admin-panel">
          <h2>დეტალური გვერდი</h2>

          <div className="admin-field">
            <label htmlFor="body">ტექსტი</label>
            <textarea
              id="body"
              name="body"
              rows={10}
              maxLength={20000}
              defaultValue={program.body}
            />
            <p className="hint">
              აბზაცები გამოყავით ცარიელი სტრიქონით. HTML არ გამოიყენება — ტექსტი
              გვერდზე ისე გამოჩნდება, როგორც აქ წერია.
            </p>
          </div>

          <div className="admin-field-row">
            <div className="admin-field">
              <label htmlFor="priceLabel">ღირებულების წარწერა</label>
              <input
                id="priceLabel"
                name="priceLabel"
                type="text"
                maxLength={80}
                placeholder="ღირებულება"
                defaultValue={program.priceLabel}
              />
            </div>

            <div className="admin-field">
              <label htmlFor="priceValue">ღირებულება</label>
              <input
                id="priceValue"
                name="priceValue"
                type="text"
                maxLength={80}
                placeholder="130 ლარი / თვე"
                defaultValue={program.priceValue}
              />
              <p className="hint">ცარიელი — ღირებულება საერთოდ არ გამოჩნდება.</p>
            </div>
          </div>
        </section>

        <section className="admin-panel">
          <h2>გამოჩენა</h2>

          <div className="admin-field">
            <label htmlFor="published" className="admin-checkbox">
              <input
                id="published"
                name="published"
                type="checkbox"
                defaultChecked={program.published}
              />
              <span>გამოქვეყნებულია</span>
            </label>
            <p className="hint">
              მოხსნილი — პროგრამა არსად ჩანს: არც სიაში, არც მთავარ გვერდზე და
              არც საკუთარ მისამართზე.
            </p>
          </div>

          <div className="admin-field">
            <label htmlFor="featured" className="admin-checkbox">
              <input
                id="featured"
                name="featured"
                type="checkbox"
                defaultChecked={program.featured}
              />
              <span>მთავარ გვერდზე</span>
            </label>
            <p className="hint">
              მთავარ გვერდზე გამოჩნდება მონიშნული {FEATURED_LIMIT} პროგრამა.
              პროგრამების გვერდზე ყველა გამოქვეყნებული ჩანს.
            </p>
          </div>

          <div className="admin-panel-actions">
            <button type="submit" className="admin-btn">
              შენახვა
            </button>
          </div>
        </section>
      </form>

      {/*
        Delete is its own form, outside the save form: nesting forms is invalid
        HTML, and the browser would drop the inner one -- so the button would
        submit the save action instead of deleting.
      */}
      <section className="admin-panel">
        <h2>წაშლა</h2>
        <p className="admin-subtitle">
          წაშლა შეუქცევადია. თუ პროგრამა დროებით არ გჭირდებათ, სჯობს მოხსნათ
          „გამოქვეყნებულია“.
        </p>
        <form action={remove}>
          <div className="admin-panel-actions">
            <button type="submit" className="admin-btn danger">
              პროგრამის წაშლა
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
