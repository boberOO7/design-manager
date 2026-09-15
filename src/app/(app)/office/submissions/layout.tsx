import { DomainMessages } from "@/i18n/domain-messages";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DomainMessages scope="submissions">{children}</DomainMessages>;
}
