import styles from './page.module.scss';

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Next.js · React · TypeScript · SCSS</p>
        <h1>Professional web template</h1>
        <p>Replace this page with your project while keeping the quality tooling in place.</p>
      </section>
    </main>
  );
}
