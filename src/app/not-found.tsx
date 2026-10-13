import Link from "next/link";
import { Masthead } from "../components/Masthead";

export default function NotFound() {
  return (
    <main className="wrap">
      <Masthead />
      <div className="empty">
        <p>No edition here.</p>
        <p>
          <Link href="/archive">Browse the archive</Link>
        </p>
      </div>
    </main>
  );
}
