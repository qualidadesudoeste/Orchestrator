export type BootstrapAdminInput = {
  username: string;
  password: string;
  name: string;
  email?: string;
};

export type BootstrapAdminRepository = {
  hasUsers(): Promise<boolean>;
  createAdmin(data: {
    username: string;
    passwordHash: string;
    name: string;
    email?: string;
  }): Promise<void>;
};

export type PasswordHasher = (password: string) => Promise<string>;

function normalizeInput(input: BootstrapAdminInput): BootstrapAdminInput {
  return {
    username: input.username.trim(),
    password: input.password,
    name: input.name.trim(),
    email: input.email?.trim() || undefined,
  };
}

function validateInput(input: BootstrapAdminInput): void {
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(input.username)) {
    throw new Error(
      "ADMIN_USERNAME deve possuir de 3 a 64 letras, números, ponto, hífen ou sublinhado.",
    );
  }
  if (input.password.length < 12 || input.password.length > 128) {
    throw new Error("ADMIN_PASSWORD deve possuir entre 12 e 128 caracteres.");
  }
  if (input.name.length < 2 || input.name.length > 255) {
    throw new Error("ADMIN_NAME deve possuir entre 2 e 255 caracteres.");
  }
  if (
    input.email &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      input.email.length > 320)
  ) {
    throw new Error("ADMIN_EMAIL deve ser um e-mail válido.");
  }
}

export async function bootstrapInitialAdmin(
  input: BootstrapAdminInput,
  repository: BootstrapAdminRepository,
  hashPassword: PasswordHasher,
): Promise<{ created: boolean; reason?: "users_exist" }> {
  const normalized = normalizeInput(input);
  validateInput(normalized);

  if (await repository.hasUsers()) {
    return { created: false, reason: "users_exist" };
  }

  const passwordHash = await hashPassword(normalized.password);
  await repository.createAdmin({
    username: normalized.username,
    passwordHash,
    name: normalized.name,
    email: normalized.email,
  });
  return { created: true };
}
