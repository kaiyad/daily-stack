import { redirect } from "next/navigation";
import { latestEditionDate } from "../lib/editions";
import { currentEditionDate } from "../lib/dates";
import { Masthead } from "../components/Masthead";

export const revalidate = 300;

export default async function Home() {
  const latest = await latestEditionDate();
  if (latest) redirect(`/${latest}`);

  return (
    <main className="wrap">
      <Masthead />
      <div className="empty">
        <p>No editions yet.</p>
        <p>
          Run <code>npm run ingest</code> then <code>npm run edition</code> to cut{" "}
          {currentEditionDate()}.
        </p>
      </div>
    </main>
  );
}
