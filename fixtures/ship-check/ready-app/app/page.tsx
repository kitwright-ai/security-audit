import Image from "next/image";

export default function Home() {
  return (
    <main>
      <Image src="/hero.jpg" alt="Our team at work" width={1200} height={600} priority />
      <h1>Fast, friendly plumbing</h1>
    </main>
  );
}
