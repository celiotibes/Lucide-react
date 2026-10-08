/**
 * Page Object Model: LoginPage
 * Encapsulates all interactions with the login screen
 */

import { device, element, by, expect as detoxExpect } from 'detox';

export class LoginPage {
  /**
   * Navigate to login screen (if needed)
   */
  async navigateToLogin(): Promise<void> {
    // Implement navigation logic if needed
    await device.reloadReactNative();
  }

  /**
   * Fill email field and verify
   */
  async fillEmail(email: string): Promise<void> {
    const emailInput = element(by.id('email-input')).atIndex(0);
    await emailInput.typeText(email);
    await detoxExpect(emailInput).toHaveToggleValue(true);
  }

  /**
   * Fill password field and verify
   */
  async fillPassword(password: string): Promise<void> {
    const passwordInput = element(by.id('password-input')).atIndex(0);
    await passwordInput.typeText(password);
    await detoxExpect(passwordInput).toHaveToggleValue(true);
  }

  /**
   * Tap the sign in button
   */
  async tapSignIn(): Promise<void> {
    const signInButton = element(by.text('Sign In'));
    await detoxExpect(signInButton).toBeVisible();
    await signInButton.tap();
  }

  /**
   * Tap forgot password button
   */
  async tapForgotPassword(): Promise<void> {
    const forgotButton = element(by.text('Forgot Password?'));
    await detoxExpect(forgotButton).toBeVisible();
    await forgotButton.tap();
  }

  /**
   * Tap register button
   */
  async tapRegister(): Promise<void> {
    const registerButton = element(by.text("Don't have an account?"));
    await detoxExpect(registerButton).toBeVisible();
    await registerButton.tap();
  }

  /**
   * Toggle password visibility
   */
  async togglePasswordVisibility(): Promise<void> {
    const eyeIcon = element(by.id('password-visibility-toggle'));
    await eyeIcon.multiTap();
  }

  /**
   * Verify error message is displayed
   */
  async verifyErrorMessage(errorText: string): Promise<void> {
    const errorElement = element(by.text(errorText));
    await detoxExpect(errorElement).toBeVisible();
  }

  /**
   * Clear all input fields
   */
  async clearAllInputs(): Promise<void> {
    const emailInput = element(by.id('email-input')).atIndex(0);
    const passwordInput = element(by.id('password-input')).atIndex(0);

    await emailInput.clearText();
    await passwordInput.clearText();
  }

  /**
   * Verify login button is disabled
   */
  async verifyLoginButtonDisabled(): Promise<void> {
    const signInButton = element(by.text('Sign In'));
    await detoxExpect(signInButton).not.toBeEnabled();
  }

  /**
   * Verify login button is enabled
   */
  async verifyLoginButtonEnabled(): Promise<void> {
    const signInButton = element(by.text('Sign In'));
    await detoxExpect(signInButton).toBeEnabled();
  }

  /**
   * Verify loading state
   */
  async verifyLoadingState(): Promise<void> {
    const loadingIndicator = element(by.id('login-loading'));
    await detoxExpect(loadingIndicator).toBeVisible();
  }

  /**
   * Complete login flow
   */
  async completeLogin(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.tapSignIn();
  }

  /**
   * Verify email field is visible
   */
  async verifyEmailFieldVisible(): Promise<void> {
    const emailLabel = element(by.text('Email'));
    await detoxExpect(emailLabel).toBeVisible();
  }

  /**
   * Verify password field is visible
   */
  async verifyPasswordFieldVisible(): Promise<void> {
    const passwordLabel = element(by.text('Password'));
    await detoxExpect(passwordLabel).toBeVisible();
  }

  /**
   * Verify screen title
   */
  async verifyLoginScreenTitle(): Promise<void> {
    const title = element(by.text('Sign In to Your Account'));
    await detoxExpect(title).toBeVisible();
  }
}

export const loginPage = new LoginPage();
