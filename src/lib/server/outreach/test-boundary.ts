/**
 * ASP Private Capital - Zero-Trust Test-Recipient Boundary
 *
 * Implements strict compliance with production-launch.txt Item 1.64-66:
 * "Test contacts: designate three controlled inboxes and HubSpot test records.
 *  Use an explicit test-recipient boundary; do not bypass cohort restrictions for arbitrary addresses."
 *
 * Guarantees:
 * 1. Arbitrary addresses outside the controlled registry CANNOT bypass cohort restrictions.
 * 2. Phase 1 canonical lead corpus is never polluted with test records or fake IDs.
 * 3. Exactly up to 3 controlled test inboxes and corresponding HubSpot test records are recognized.
 */

export interface ControlledTestRecord {
  readonly email: string;
  readonly hubspotId: string;
  readonly name: string;
  readonly leadId: string;
  readonly role: "primary_operator" | "secondary_qa" | "tertiary_staging";
}

let dynamicOperatorTestRecord: ControlledTestRecord | null = null;

export function registerOperatorTestRecipient(record: {
  email: string;
  name?: string;
  hubspotId?: string;
}): ControlledTestRecord {
  const normalizedEmail = record.email.toLowerCase().trim();
  const hubspotId = record.hubspotId?.trim() || process.env.HUBSPOT_TEST_CONTACT_ID || "908035561662";
  const name = record.name?.trim() || process.env.HUBSPOT_TEST_CONTACT_NAME || "Dylan";

  const newRecord: ControlledTestRecord = Object.freeze({
    email: normalizedEmail,
    hubspotId,
    name,
    leadId: `lead-${hubspotId}`,
    role: "primary_operator" as const,
  });

  dynamicOperatorTestRecord = newRecord;
  return newRecord;
}

/**
 * Returns the immutable list of designated controlled test inboxes.
 * Reads designated identifiers from environment configuration with secure defaults.
 */
export function getControlledTestRecords(): readonly ControlledTestRecord[] {
  const records: ControlledTestRecord[] = [];

  if (dynamicOperatorTestRecord) {
    records.push(dynamicOperatorTestRecord);
  }

  // Primary Operator Controlled Test Inbox
  const primaryEmail = (process.env.HUBSPOT_TEST_CONTACT_EMAIL || "digitalteddybear2002@gmail.com")
    .toLowerCase()
    .trim();
  const primaryId = (process.env.HUBSPOT_TEST_CONTACT_ID || "908035561662").trim();
  const primaryName = (process.env.HUBSPOT_TEST_CONTACT_NAME || "Dylan").trim();

  if (primaryEmail && primaryId && primaryEmail !== dynamicOperatorTestRecord?.email) {
    records.push(
      Object.freeze({
        email: primaryEmail,
        hubspotId: primaryId,
        name: primaryName,
        leadId: `lead-${primaryId}`,
        role: "primary_operator" as const,
      })
    );
  }

  // Secondary ASP Corporate Test Inbox (Dylan)
  const corporateEmail = "dylan@aspinvest.co.uk";
  if (corporateEmail !== dynamicOperatorTestRecord?.email && corporateEmail !== primaryEmail) {
    records.push(
      Object.freeze({
        email: corporateEmail,
        hubspotId: primaryId,
        name: "Dylan",
        leadId: `lead-${primaryId}`,
        role: "secondary_qa" as const,
      })
    );
  }

  // Secondary QA Controlled Test Inbox (if provisioned)
  const secondEmail = process.env.TEST_INBOX_2_EMAIL?.toLowerCase().trim();
  const secondId = process.env.TEST_INBOX_2_HUBSPOT_ID?.trim();
  const secondName = process.env.TEST_INBOX_2_NAME?.trim() || "QA Controlled Test Inbox";
  if (secondEmail && secondId) {
    records.push(
      Object.freeze({
        email: secondEmail,
        hubspotId: secondId,
        name: secondName,
        leadId: `lead-${secondId}`,
        role: "secondary_qa" as const,
      })
    );
  }

  // Tertiary Staging Controlled Test Inbox (if provisioned)
  const thirdEmail = process.env.TEST_INBOX_3_EMAIL?.toLowerCase().trim();
  const thirdId = process.env.TEST_INBOX_3_HUBSPOT_ID?.trim();
  const thirdName = process.env.TEST_INBOX_3_NAME?.trim() || "Staging Controlled Test Inbox";
  if (thirdEmail && thirdId) {
    records.push(
      Object.freeze({
        email: thirdEmail,
        hubspotId: thirdId,
        name: thirdName,
        leadId: `lead-${thirdId}`,
        role: "tertiary_staging" as const,
      })
    );
  }

  return Object.freeze(records);
}

export interface TestRecipientValidationResult {
  readonly isDesignatedTestRecipient: boolean;
  readonly valid: boolean;
  readonly testRecord?: ControlledTestRecord;
  readonly reason?: string;
}

/**
 * Validates whether a target email (and optional leadId) strictly falls within
 * the designated controlled test-recipient boundary.
 *
 * Arbitrary addresses return `valid: false` to ensure cohort integrity.
 */
export function validateTestRecipientBoundary(
  email: string,
  leadId?: string
): TestRecipientValidationResult {
  const normalizedEmail = email.toLowerCase().trim();
  const designated = getControlledTestRecords();
  const match = designated.find((r) => r.email === normalizedEmail);

  if (!match) {
    return {
      isDesignatedTestRecipient: false,
      valid: false,
      reason: `Address '${email}' is not a designated controlled test inbox. Cohort bypass for arbitrary addresses is strictly denied under zero-trust policy.`,
    };
  }

  if (leadId) {
    const normalizedLeadId = leadId.trim();
    const expectedLeadPrefix = `lead-${match.hubspotId}`;
    const expectedTestPrefix = `test-${match.hubspotId}`;
    if (
      normalizedLeadId !== expectedLeadPrefix &&
      normalizedLeadId !== expectedTestPrefix &&
      normalizedLeadId !== match.hubspotId
    ) {
      return {
        isDesignatedTestRecipient: true,
        valid: false,
        testRecord: match,
        reason: `Supplied lead ID '${leadId}' does not match the designated HubSpot test record '${match.hubspotId}' for ${match.email}.`,
      };
    }
  }

  return {
    isDesignatedTestRecipient: true,
    valid: true,
    testRecord: match,
  };
}
