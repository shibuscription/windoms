import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);

const getArgValue = (name) => {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? "";
  return "";
};

const projectId = process.env.GCLOUD_PROJECT || getArgValue("--project");
const email = getArgValue("--email");
const uid = getArgValue("--uid");

if (!projectId) {
  console.error("projectId が必要です。--project か GCLOUD_PROJECT を指定してください。");
  process.exit(1);
}

if (!email && !uid) {
  console.error("対象ユーザーを --email もしくは --uid で指定してください。");
  process.exit(1);
}

initializeApp({ projectId });

const auth = getAuth();

const run = async () => {
  const user = email ? await auth.getUserByEmail(email) : await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};
  await auth.setCustomUserClaims(user.uid, {
    ...currentClaims,
    admin: true,
  });

  console.log(
    JSON.stringify(
      {
        projectId,
        uid: user.uid,
        email: user.email ?? "",
        admin: true,
      },
      null,
      2,
    ),
  );
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
