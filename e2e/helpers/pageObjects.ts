/**
 * Page Objects for E2E Testing
 * Encapsulates screen elements and interactions following Page Object Model pattern
 */

import { TestHelper, PerformanceHelper, LogHelper } from './testHelpers';

/**
 * Login Screen Page Object
 */
export class LoginScreenPageObject {
  // Element IDs
  private emailInputId = 'loginEmailInput';
  private passwordInputId = 'loginPasswordInput';
  private loginButtonId = 'loginButton';
  private forgotPasswordButtonId = 'forgotPasswordButton';
  private biometricButtonId = 'biometricLoginButton';
  private errorMessageId = 'loginErrorMessage';
  private rememberMeCheckboxId = 'rememberMeCheckbox';

  /**
   * Enter email address
   */
  async enterEmail(email: string) {
    LogHelper.info(`Entering email: ${email.substring(0, 5)}***`);
    await TestHelper.typeText(this.emailInputId, email);
  }

  /**
   * Enter password securely
   */
  async enterPassword(password: string) {
    LogHelper.info('Entering password');
    await TestHelper.typeText(this.passwordInputId, password, true);
  }

  /**
   * Click login button
   */
  async clickLogin() {
    LogHelper.info('Clicking login button');
    const actionTime = await PerformanceHelper.measureActionTime(async () => {
      await TestHelper.tap(this.loginButtonId);
    });
    LogHelper.info(`Login action took ${actionTime.toFixed(2)}ms`);
    return actionTime;
  }

  /**
   * Click forgot password
   */
  async clickForgotPassword() {
    LogHelper.info('Clicking forgot password');
    await TestHelper.tap(this.forgotPasswordButtonId);
  }

  /**
   * Click biometric login button
   */
  async clickBiometricLogin() {
    LogHelper.info('Clicking biometric login');
    await TestHelper.tap(this.biometricButtonId);
  }

  /**
   * Toggle remember me checkbox
   */
  async toggleRememberMe() {
    LogHelper.info('Toggling remember me');
    await TestHelper.tap(this.rememberMeCheckboxId);
  }

  /**
   * Get error message
   */
  async getErrorMessage(): Promise<string> {
    try {
      return await TestHelper.getText(this.errorMessageId);
    } catch {
      return '';
    }
  }

  /**
   * Check if login button is visible
   */
  async isLoginButtonVisible(): Promise<boolean> {
    try {
      await TestHelper.waitForElement(this.loginButtonId, 3000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Complete login flow
   */
  async completeLogin(email: string, password: string): Promise<number> {
    const startTime = performance.now();

    await this.enterEmail(email);
    await this.enterPassword(password);
    const actionTime = await this.clickLogin();

    // Wait for navigation
    await TestHelper.waitForNetworkIdle();

    const totalTime = performance.now() - startTime;
    LogHelper.info(`Total login time: ${totalTime.toFixed(2)}ms`);

    return totalTime;
  }
}

/**
 * Dashboard Screen Page Object
 */
export class DashboardScreenPageObject {
  private welcomeTextId = 'dashboardWelcomeText';
  private logoutButtonId = 'dashboardLogoutButton';
  private settingsButtonId = 'dashboardSettingsButton';
  private balanceDisplayId = 'dashboardBalanceDisplay';
  private transactionsListId = 'dashboardTransactionsList';

  /**
   * Check if dashboard is loaded
   */
  async isDashboardLoaded(): Promise<boolean> {
    try {
      await TestHelper.waitForElement(this.welcomeTextId, 5000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get welcome text
   */
  async getWelcomeText(): Promise<string> {
    return await TestHelper.getText(this.welcomeTextId);
  }

  /**
   * Get balance display
   */
  async getBalanceDisplay(): Promise<string> {
    try {
      return await TestHelper.getText(this.balanceDisplayId);
    } catch {
      return '';
    }
  }

  /**
   * Click logout
   */
  async clickLogout() {
    LogHelper.info('Clicking logout button');
    await TestHelper.tap(this.logoutButtonId);
  }

  /**
   * Click settings
   */
  async clickSettings() {
    LogHelper.info('Clicking settings button');
    await TestHelper.tap(this.settingsButtonId);
  }

  /**
   * Scroll to transactions
   */
  async scrollToTransactions() {
    await TestHelper.scrollToElement(this.transactionsListId);
  }
}

/**
 * Settings Screen Page Object
 */
export class SettingsScreenPageObject {
  private securitySectionId = 'settingsSecuritySection';
  private privacySectionId = 'settingsPrivacySection';
  private biometricToggleId = 'settingsBiometricToggle';
  private deleteAccountButtonId = 'settingsDeleteAccountButton';
  private dataExportButtonId = 'settingsDataExportButton';
  private changePasswordButtonId = 'settingsChangePasswordButton';
  private twoFactorToggleId = 'settingsTwoFactorToggle';
  private privacyAcceptanceButtonId = 'settingsPrivacyAcceptance';
  private backButtonId = 'settingsBackButton';

  /**
   * Click security section
   */
  async clickSecuritySection() {
    LogHelper.info('Clicking security section');
    await TestHelper.tap(this.securitySectionId);
  }

  /**
   * Click privacy section
   */
  async clickPrivacySection() {
    LogHelper.info('Clicking privacy section');
    await TestHelper.tap(this.privacySectionId);
  }

  /**
   * Toggle biometric
   */
  async toggleBiometric() {
    LogHelper.info('Toggling biometric setting');
    await TestHelper.tap(this.biometricToggleId);
  }

  /**
   * Toggle two-factor authentication
   */
  async toggleTwoFactor() {
    LogHelper.info('Toggling two-factor authentication');
    await TestHelper.tap(this.twoFactorToggleId);
  }

  /**
   * Accept privacy terms
   */
  async acceptPrivacyTerms() {
    LogHelper.info('Accepting privacy terms');
    await TestHelper.tap(this.privacyAcceptanceButtonId);
  }

  /**
   * Click change password
   */
  async clickChangePassword() {
    LogHelper.info('Clicking change password');
    await TestHelper.tap(this.changePasswordButtonId);
  }

  /**
   * Click export data
   */
  async clickExportData() {
    LogHelper.info('Clicking export data');
    await TestHelper.tap(this.dataExportButtonId);
  }

  /**
   * Click delete account
   */
  async clickDeleteAccount() {
    LogHelper.info('Clicking delete account');
    await TestHelper.tap(this.deleteAccountButtonId);
  }

  /**
   * Navigate back
   */
  async goBack() {
    await TestHelper.tap(this.backButtonId);
  }
}

/**
 * Change Password Screen Page Object
 */
export class ChangePasswordScreenPageObject {
  private currentPasswordInputId = 'changePasswordCurrentInput';
  private newPasswordInputId = 'changePasswordNewInput';
  private confirmPasswordInputId = 'changePasswordConfirmInput';
  private submitButtonId = 'changePasswordSubmitButton';
  private successMessageId = 'changePasswordSuccessMessage';
  private errorMessageId = 'changePasswordErrorMessage';

  /**
   * Enter current password
   */
  async enterCurrentPassword(password: string) {
    LogHelper.info('Entering current password');
    await TestHelper.typeText(this.currentPasswordInputId, password, true);
  }

  /**
   * Enter new password
   */
  async enterNewPassword(password: string) {
    LogHelper.info('Entering new password');
    await TestHelper.typeText(this.newPasswordInputId, password, true);
  }

  /**
   * Confirm new password
   */
  async confirmNewPassword(password: string) {
    LogHelper.info('Confirming new password');
    await TestHelper.typeText(this.confirmPasswordInputId, password, true);
  }

  /**
   * Submit password change
   */
  async submitPasswordChange() {
    LogHelper.info('Submitting password change');
    await TestHelper.tap(this.submitButtonId);
    await TestHelper.waitForNetworkIdle();
  }

  /**
   * Get success message
   */
  async getSuccessMessage(): Promise<string> {
    try {
      return await TestHelper.getText(this.successMessageId);
    } catch {
      return '';
    }
  }

  /**
   * Get error message
   */
  async getErrorMessage(): Promise<string> {
    try {
      return await TestHelper.getText(this.errorMessageId);
    } catch {
      return '';
    }
  }

  /**
   * Complete password change
   */
  async completePasswordChange(
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    await this.enterCurrentPassword(currentPassword);
    await this.enterNewPassword(newPassword);
    await this.confirmNewPassword(newPassword);
    await this.submitPasswordChange();

    // Check for success
    const successMessage = await this.getSuccessMessage();
    return successMessage.length > 0;
  }
}

/**
 * Data Deletion Screen Page Object
 */
export class DataDeletionScreenPageObject {
  private confirmCheckboxId = 'dataDeletionConfirmCheckbox';
  private deleteButtonId = 'dataDeletionDeleteButton';
  private cancelButtonId = 'dataDeletionCancelButton';
  private warningMessageId = 'dataDeletionWarningMessage';
  private successMessageId = 'dataDeletionSuccessMessage';

  /**
   * Check confirmation checkbox
   */
  async checkConfirmation() {
    LogHelper.info('Checking data deletion confirmation');
    await TestHelper.tap(this.confirmCheckboxId);
  }

  /**
   * Click delete button
   */
  async clickDelete() {
    LogHelper.info('Clicking delete button');
    await TestHelper.tap(this.deleteButtonId);
  }

  /**
   * Click cancel
   */
  async clickCancel() {
    LogHelper.info('Clicking cancel');
    await TestHelper.tap(this.cancelButtonId);
  }

  /**
   * Get warning message
   */
  async getWarningMessage(): Promise<string> {
    try {
      return await TestHelper.getText(this.warningMessageId);
    } catch {
      return '';
    }
  }

  /**
   * Get success message
   */
  async getSuccessMessage(): Promise<string> {
    try {
      return await TestHelper.getText(this.successMessageId);
    } catch {
      return '';
    }
  }

  /**
   * Complete data deletion
   */
  async completeDataDeletion(): Promise<boolean> {
    await this.checkConfirmation();
    await this.clickDelete();
    await TestHelper.waitForNetworkIdle(10000);

    const successMessage = await this.getSuccessMessage();
    return successMessage.length > 0;
  }
}

/**
 * Biometric Authentication Page Object
 */
export class BiometricAuthPageObject {
  private biometricPromptId = 'biometricPrompt';
  private retryButtonId = 'biometricRetryButton';
  private usePasswordButtonId = 'biometricUsePasswordButton';

  /**
   * Wait for biometric prompt
   */
  async waitForBiometricPrompt(): Promise<boolean> {
    try {
      await TestHelper.waitForElement(this.biometricPromptId, 5000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Click retry biometric
   */
  async clickRetry() {
    LogHelper.info('Retrying biometric authentication');
    await TestHelper.tap(this.retryButtonId);
  }

  /**
   * Click use password fallback
   */
  async clickUsePassword() {
    LogHelper.info('Using password fallback');
    await TestHelper.tap(this.usePasswordButtonId);
  }
}

/**
 * Offline Mode Page Object
 */
export class OfflineModePageObject {
  private offlineBannerMessageId = 'offlineBannerMessage';
  private cachedDataDisplayId = 'cachedDataDisplay';
  private syncButtonId = 'syncButton';

  /**
   * Check if offline banner is shown
   */
  async isOfflineBannerShown(): Promise<boolean> {
    try {
      await TestHelper.waitForElement(this.offlineBannerMessageId, 3000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get offline message
   */
  async getOfflineMessage(): Promise<string> {
    try {
      return await TestHelper.getText(this.offlineBannerMessageId);
    } catch {
      return '';
    }
  }

  /**
   * Click sync button
   */
  async clickSync() {
    LogHelper.info('Clicking sync button');
    try {
      await TestHelper.tap(this.syncButtonId);
    } catch {
      LogHelper.warn('Sync button not found');
    }
  }
}
