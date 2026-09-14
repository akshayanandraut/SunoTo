const KEY = "random-chat.preferences.v1";

export function loadPreferences(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(KEY)) || {};
    return {
      age: Number.isInteger(Number(value.age)) ? Number(value.age) : "",
      gender: ["Male", "Female", "Other"].includes(value.gender) ? value.gender : "",
      name: String(value.name ?? "").replace(/[&<>"']/g, "").slice(0, 24),
      languages: Array.isArray(value.languages) ? value.languages.slice(0, 3) : [],
      interests: Array.isArray(value.interests) ? value.interests.slice(0, 5) : [],
      allowVirtualFallback: value.allowVirtualFallback === true
    };
  } catch { return {}; }
}

export function savePreferences(profile, storage = localStorage) {
  const safe = {
    age: Number(profile.age), gender: profile.gender, name: String(profile.name ?? "").replace(/[&<>"']/g, "").slice(0, 24),
    languages: [...profile.languages], interests: [...profile.interests], allowVirtualFallback: profile.allowVirtualFallback === true
  };
  storage.setItem(KEY, JSON.stringify(safe));
  return safe;
}
