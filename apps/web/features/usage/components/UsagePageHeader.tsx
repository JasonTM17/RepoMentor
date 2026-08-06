import type { FC, ReactElement } from "react";

import UsageSourceNote from "@/features/usage/components/UsageSourceNote";
import type { UsageTransport } from "@/features/usage/types";

interface UsagePageHeaderProps {
  readonly description: string;
  readonly kicker: string;
  readonly source: UsageTransport["source"];
  readonly title: string;
}

const UsagePageHeader: FC<UsagePageHeaderProps> = ({
  description,
  kicker,
  source,
  title,
}): ReactElement => (
  <header className="usage-page-header">
    <div className="usage-page-intro">
      <p className="section-kicker">{kicker}</p>
      <h1 className="usage-page-title">{title}</h1>
      <p className="usage-page-description">{description}</p>
    </div>
    <UsageSourceNote source={source} />
  </header>
);

export default UsagePageHeader;
