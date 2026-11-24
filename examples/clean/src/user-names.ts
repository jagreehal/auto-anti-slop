export interface User {
  active: boolean;
  name: string;
}

export function userNames(users: ReadonlyArray<User>): Array<string> {
  return users.flatMap((user) => (user.active ? [user.name] : []));
}
