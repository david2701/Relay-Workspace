import { beforeEach } from "vitest";
import {
  resetDisplayContextForTests,
  setDisplayContext,
} from "../lib/display_context";
import { resetUserProfileForTests, setUserProfile } from "../lib/user_profile";

beforeEach(() => {
  resetDisplayContextForTests();
  setDisplayContext({
    timezone: "Europe/Paris",
    intlLocale: "es-ES",
    locale: "es",
  });
  resetUserProfileForTests();
  setUserProfile({ displayName: "Alex", initial: "A" });
});
