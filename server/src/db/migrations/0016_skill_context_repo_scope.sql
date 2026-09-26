-- Attachments made before this column existed carry no repo, and there is no way to tell which repo a path was picked from; they are cleared (re-attach from the Context tab) rather than guessed.
DELETE FROM "skill_context_docs";--> statement-breakpoint
ALTER TABLE "skill_context_docs" DROP CONSTRAINT "skill_context_docs_skill_id_path_pk";--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD COLUMN "repo_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_skill_id_repo_id_path_pk" PRIMARY KEY("skill_id","repo_id","path");--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
