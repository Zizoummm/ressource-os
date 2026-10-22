import "./style.css";
export const metadata = {
  title: "AXIOM ResourceOS | Resource Intelligence. Sovereign Control.",
  description:
    "Resource traceability, independent verification and controlled demonstration export authorization.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
