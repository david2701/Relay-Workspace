export type UserProfile = {
  displayName: string;
  initial: string;
};

const DEFAULT: UserProfile = {
  displayName: "You",
  initial: "Y",
};

let profile: UserProfile = { ...DEFAULT };

export function getUserProfile(): UserProfile {
  return profile;
}

export function setUserProfile(next: UserProfile): void {
  profile = next;
}

export function resetUserProfileForTests(): void {
  profile = { ...DEFAULT };
}
