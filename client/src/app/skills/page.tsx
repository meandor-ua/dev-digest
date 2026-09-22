"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { SkillsColumn } from "./_components/SkillsColumn";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { useSkills } from "@/lib/hooks/skills";
import { CreateSkillModal } from "./_components/CreateSkillModal";

export default function SkillsPage() {
  const router = useRouter();
  const t = useTranslations("skills");
  const { data: skills, isLoading } = useSkills();
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (skills && skills.length > 0) {
      router.replace(`/skills/${skills[0]!.id}`);
    }
  }, [skills, router]);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills") },
  ];

  return (
    <AppShell crumb={crumb}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <SkillsColumn tab="config" />

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          {isLoading ? (
            <div style={{ width: "100%", maxWidth: 500, display: "flex", flexDirection: "column", gap: 16 }}>
              <Skeleton height={28} width={240} />
              <Skeleton height={160} />
            </div>
          ) : (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.addSkill")}
              onCta={() => setCreating(true)}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
