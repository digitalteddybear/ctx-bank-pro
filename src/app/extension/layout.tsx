import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation | CTX BankPro | ASP Private Capital",
  description:
    "Operating documentation for CTX BankPro, tailored for ASP Private Capital.",
};

export default function ExtensionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
