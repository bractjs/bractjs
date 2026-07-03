// app/permissions.ts — the capability catalog (client-safe, no DB).
//
// Roles grant a subset of these; a user's effective permissions are the union of
// every role assigned to them directly OR via a group they belong to. Routes gate
// on a single permission key; the sidebar hides sections the user can't reach.

export const PERMISSIONS = {
  "posts.manage": "Posts",
  "pages.manage": "Pages",
  "categories.manage": "Categories",
  "media.manage": "Media",
  "menus.manage": "Menus",
  "fields.manage": "Custom fields",
  "users.manage": "Users",
  "roles.manage": "Roles & groups",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; items: Permission[] }[] = [
  {
    label: "Content",
    items: [
      "posts.manage",
      "pages.manage",
      "categories.manage",
      "media.manage",
      "menus.manage",
      "fields.manage",
    ],
  },
  { label: "Administration", items: ["users.manage", "roles.manage"] },
];

/** Default permissions for the seeded "Editor" role. */
export const EDITOR_PERMISSIONS: Permission[] = [
  "posts.manage",
  "pages.manage",
  "categories.manage",
  "media.manage",
  "fields.manage",
];
