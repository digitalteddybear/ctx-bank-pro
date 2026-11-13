# HubSpot property registry

Observed 2026-11-03T08:06:54.532Z. CSV: 270. Live: 440. Added: 170. Absent: 0. Changed definitions: 11.

Live API definitions are authoritative. Complete definitions, exact options, flags, constraints and original CSV metadata: data/generated/hubspot/contact-registry.json. No renamed property is inferred from similar labels. CSV has no fieldType column; do not infer multiselect semantics from display text.

All fields remain read-only in this phase. Reviewable means eligible for a human-reviewed proposal, not write authorization. Restricted includes financial self-reports; protected includes identity, consent, calculated and system-managed fields.

| Internal name | Label | Type / field | Group | Classification | CTX mapping proposal |
|---|---|---|---|---|---|
| address | Street Address | string/text | contactinformation | restricted | Unmapped; read only |
| address_2 | Address 2  | string/text | contactinformation | restricted | Unmapped; read only |
| aircall_last_call_at | Last Aircall call timestamp | datetime/date | aircall | restricted | Unmapped; read only |
| aircall_last_sms_at | Last Aircall SMS timestamp | datetime/date | aircall | restricted | Unmapped; read only |
| aircall_last_sms_direction | Last Aircall SMS direction | string/text | aircall | restricted | Unmapped; read only |
| annualrevenue | Annual Revenue | string/text | contactinformation | restricted | Unmapped; read only |
| approximately_how_much_capital_do_you_have_available_for_investment | Approximately how much capital do you have available for investment? | string/text | lead_ads | restricted | capital.selfReported |
| are_you_already_a_certified_highnetworth_individual_or_a_sophisticated_investor | Are you already a certified high-net-worth individual or a sophisticated investor? | string/text | lead_ads | restricted | qualification.selfReportedOnly |
| are_you_an_investor | Are you an investor? | string/text | lead_ads | restricted | investor.selfReported |
| associatedcompanyid | Primary Associated Company ID | number/number | contactinformation | restricted | Unmapped; read only |
| associatedcompanylastupdated | Associated Company Last Updated | number/number | contactinformation | protected | Unmapped; read only |
| aum | AUM | string/text | contactinformation | restricted | assets.selfReported |
| aum__usd_m_ | AUM (USD m) | string/text | contactinformation | restricted | assets.selfReportedUsdMillions |
| city | City | string/text | contactinformation | reviewable | location.city |
| closedate | Close Date | datetime/date | contactinformation | restricted | Unmapped; read only |
| company | Company Name | string/text | contactinformation | reviewable | employment.company |
| company_size | Company size | string/text | contactinformation | restricted | Unmapped; read only |
| country | Country/Region | string/text | contactinformation | reviewable | location.country |
| createdate | Create Date | datetime/date | contactinformation | protected | Unmapped; read only |
| ctx_booking_link_sent | CTX Booking Link Sent | bool/booleancheckbox | ctx_operations | reviewable | workflow.bookingLinkSent |
| ctx_last_contact | CTX Last Contact | datetime/date | ctx_operations | reviewable | workflow.lastContact |
| ctx_status | CTX Status | enumeration/select | ctx_operations | reviewable | workflow.status |
| currentlyinworkflow | Currently in workflow (discontinued) | enumeration/booleancheckbox | emailinformation | protected | Unmapped; read only |
| date_of_birth | Date of birth | string/text | contactinformation | restricted | Unmapped; read only |
| days_to_close | Days To Close | number/number | contactinformation | protected | Unmapped; read only |
| degree | Degree | string/text | contactinformation | restricted | Unmapped; read only |
| dialpad_last_inbound_call_timestamp | Last inbound call timestamp | datetime/date | contact_activity | restricted | Unmapped; read only |
| dialpad_last_inbound_message | Last inbound message | string/textarea | contact_activity | restricted | Unmapped; read only |
| dialpad_last_inbound_message_timestamp | Last inbound message timestamp | datetime/date | contact_activity | restricted | Unmapped; read only |
| dialpad_last_outbound_call_timestamp | Last outbound call timestamp | datetime/date | contact_activity | restricted | Unmapped; read only |
| dialpad_last_outbound_message | Last outbound message | string/textarea | contact_activity | restricted | Unmapped; read only |
| dialpad_last_outbound_message_timestamp | Last outbound message timestamp | datetime/date | contact_activity | restricted | Unmapped; read only |
| email | Email | string/text | contactinformation | protected | identity.email |
| engagements_last_meeting_booked | Date of last meeting booked in meetings tool | datetime/date | contactinformation | protected | Unmapped; read only |
| engagements_last_meeting_booked_campaign | Campaign of last booking in meetings tool | string/text | contactinformation | protected | Unmapped; read only |
| engagements_last_meeting_booked_medium | Medium of last booking in meetings tool | string/text | contactinformation | protected | Unmapped; read only |
| engagements_last_meeting_booked_source | Source of last booking in meetings tool | string/text | contactinformation | protected | Unmapped; read only |
| fax | Fax Number | string/phonenumber | contactinformation | restricted | Unmapped; read only |
| field_ip_address | field_IP Address | number/number | contactinformation | protected | Unmapped; read only |
| field_of_study | Field of study | string/text | contactinformation | restricted | Unmapped; read only |
| first_conversion_date | First Conversion Date | datetime/date | conversioninformation | protected | Unmapped; read only |
| first_conversion_event_name | First Conversion | string/text | conversioninformation | protected | Unmapped; read only |
| first_deal_created_date | First Deal Created Date | datetime/date | contactinformation | protected | Unmapped; read only |
| firstname | First Name | string/text | contactinformation | reviewable | identity.firstName |
| followercount | Follower Count | number/number | socialmediainformation | restricted | Unmapped; read only |
| gender | Gender | string/text | contactinformation | restricted | Unmapped; read only |
| graduation_date | Graduation date | string/text | contactinformation | restricted | Unmapped; read only |
| holdings | holdings  | string/text | contactinformation | restricted | holdings.selfReported |
| how_would_you_describe_your_experience_with_investing | How would you describe your experience with investing? | string/text | lead_ads | restricted | experience.selfReported |
| hs_active_contracts_arr | Annual Recurring Revenue of Contracts | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_active_contracts_mrr | Monthly Recurring Revenue of Contracts | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_active_contracts_tcv | Total Active Contract Value | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_additional_emails | Additional email addresses | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_all_accessible_team_ids | All teams | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_all_assigned_business_unit_ids | Brands | enumeration/checkbox | contactinformation | restricted | Unmapped; read only |
| hs_all_contact_vids | All vids for a contact | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_all_owner_ids | All owner IDs | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_all_team_ids | All team IDs | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_analytics_average_page_views | Average Pageviews | number/number | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_first_referrer | First Referring Site | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_first_timestamp | Time First Seen | datetime/date | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_first_touch_converting_campaign | First Touch Converting Campaign | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_first_url | First Page Seen | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_first_visit_timestamp | Time of First Session | datetime/date | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_last_referrer | Last Referring Site | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_last_timestamp | Time Last Seen | datetime/date | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_last_touch_converting_campaign | Last Touch Converting Campaign | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_last_url | Last Page Seen | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_last_visit_timestamp | Time of Last Session | datetime/date | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_num_event_completions | Number of event completions | number/number | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_num_page_views | Number of Pageviews | number/number | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_num_visits | Number of Sessions | number/number | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_revenue | Event Revenue | number/number | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_source | Original Source | enumeration/select | analyticsinformation | restricted | Unmapped; read only |
| hs_analytics_source_composite_data | Original Traffic Source Composite Data | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_source_data_1 | Original Source Drill-Down 1 | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_analytics_source_data_2 | Original Source Drill-Down 2 | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_associated_target_accounts | Associated Target Accounts | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_avatar_filemanager_key | Avatar FileManager key | string/text | contactinformation | protected | Unmapped; read only |
| hs_bing_ad_clicked | Bing ad clicked | bool/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_bing_click_id | Bing click id | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_buying_role | Buying Role | enumeration/checkbox | contactinformation | restricted | Unmapped; read only |
| hs_calculated_form_submissions | The 800 most recent form submissions for a contact | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_calculated_merged_vids | Merged vids with timestamps of a contact | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_calculated_mobile_number | Calculated Mobile Number in International Format | string/text | contactinformation | protected | Unmapped; read only |
| hs_calculated_phone_number | Calculated Phone Number in International Format | string/text | contactinformation | protected | Unmapped; read only |
| hs_calculated_phone_number_area_code | Calculated Phone Number Area Code | string/text | contactinformation | protected | Unmapped; read only |
| hs_calculated_phone_number_country_code | Calculated Phone Number Country Code | string/text | contactinformation | protected | Unmapped; read only |
| hs_calculated_phone_number_region_code | Calculated Phone Number Region | string/text | contactinformation | protected | Unmapped; read only |
| hs_chat_assistant_iql_date | Chat Assistant IQL Date | datetime/date | contactinformation | restricted | Unmapped; read only |
| hs_chat_assistant_source | Chat Assistant Source | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_chat_assistant_summary | Chat Assistant:Summary | string/html | contactinformation | restricted | Unmapped; read only |
| hs_chatgpt_ad_clicked | ChatGPT ad clicked | bool/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_chatgpt_click_id | ChatGPT click id | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_clicked_linkedin_ad | Clicked on a LinkedIn Ad | enumeration/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_consent_to_email_tracking | Email tracking consent | enumeration/select | emailinformation | protected | Unmapped; read only |
| hs_contact_enrichment_opt_out | Enrichment opt out | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_contact_enrichment_opt_out_timestamp | Enrichment opt out timestamp | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_content_membership_email | Member email | string/text | contactinformation | protected | Unmapped; read only |
| hs_content_membership_email_confirmed | Email Confirmed | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_content_membership_follow_up_enqueued_at | Time enrolled in registration follow up emails | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_content_membership_notes | Membership Notes | string/textarea | contactinformation | restricted | Unmapped; read only |
| hs_content_membership_registered_at | Registered At | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_content_membership_registration_domain_sent_to | Domain to which registration email was sent | string/text | contactinformation | protected | Unmapped; read only |
| hs_content_membership_registration_email_sent_at | Time registration email was sent | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_content_membership_status | Status | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_conversations_visitor_email | Conversations visitor email | string/text | contactinformation | protected | Unmapped; read only |
| hs_count_is_unworked | Count of unengaged contacts | number/calculation_equation | contactinformation | protected | Unmapped; read only |
| hs_count_is_worked | Count of engaged contacts | number/calculation_equation | contactinformation | protected | Unmapped; read only |
| hs_country_region_code | Country/Region Code | string/text | contactinformation | restricted | Unmapped; read only |
| hs_created_by_conversations | Created By Conversations | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_created_by_user_id | Created by user ID | number/number | contactinformation | protected | Unmapped; read only |
| hs_createdate | Object create date/time | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_cross_account_data_mirroring_source_account_ids | Cross-account data mirroring sources | enumeration/checkbox | multiaccountmanagement | protected | Unmapped; read only |
| hs_cross_account_note | Cross-Account Note | string/textarea | multiaccountmanagement | restricted | Unmapped; read only |
| hs_cross_sell_opportunity | Cross-sell Opportunity | bool/booleancheckbox | multiaccountmanagement | restricted | Unmapped; read only |
| hs_current_customer | Current Customer | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_currently_enrolled_in_prospecting_agent | Currently Enrolled in Prospecting Agent | bool/calculation_equation | contactinformation | protected | Unmapped; read only |
| hs_customer_agent_lead_status | Customer Agent Lead Status | enumeration/radio | contactinformation | protected | Unmapped; read only |
| hs_data_privacy_ads_consent | Ads Consent from Forms | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_document_last_revisited | Recent Document Revisit Date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_email_bad_address | Invalid email address | bool/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_email_bounce | Marketing emails bounced | number/number | emailinformation | protected | Unmapped; read only |
| hs_email_click | Marketing emails clicked | number/number | emailinformation | protected | Unmapped; read only |
| hs_email_communication_subscriptions_opted_in | Email subscription types: subscribed | enumeration/checkbox | emailinformation | protected | Unmapped; read only |
| hs_email_communication_subscriptions_opted_out | Email subscription types: unsubscribed | enumeration/checkbox | emailinformation | protected | Unmapped; read only |
| hs_email_customer_quarantined_reason | Email address quarantine reason | enumeration/select | emailinformation | protected | Unmapped; read only |
| hs_email_delivered | Marketing emails delivered | number/number | emailinformation | protected | Unmapped; read only |
| hs_email_domain | Email Domain | string/text | contactinformation | protected | Unmapped; read only |
| hs_email_engagement_likelihood_category | Email Engagement Likelihood Category | enumeration/select | emailinformation | protected | Unmapped; read only |
| hs_email_first_click_date | First marketing email click date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_first_open_date | First marketing email open date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_first_reply_date | First marketing email reply date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_first_send_date | First marketing email send date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_hard_bounce_reason | Email hard bounce reason | string/text | emailinformation | protected | Unmapped; read only |
| hs_email_hard_bounce_reason_enum | Email hard bounce reason | enumeration/radio | emailinformation | protected | Unmapped; read only |
| hs_email_is_ineligible | Is globally ineligible | bool/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_email_last_click_date | Last marketing email click date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_last_email_name | Last marketing email name | string/text | emailinformation | protected | Unmapped; read only |
| hs_email_last_open_date | Last marketing email open date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_last_reply_date | Last marketing email reply date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_last_send_date | Last marketing email send date | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_live_sourcing_restricted | Email live sourcing restricted | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_email_open | Marketing emails opened | number/number | emailinformation | protected | Unmapped; read only |
| hs_email_optimal_send_day_of_week | Optimal marketing email send day of week | string/text | emailinformation | protected | Unmapped; read only |
| hs_email_optimal_send_time_of_day | Optimal marketing email send time of day | string/text | emailinformation | protected | Unmapped; read only |
| hs_email_optout | Unsubscribed from all email | bool/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_email_optout_332041101 | Opted out of email: Marketing Information | enumeration/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_email_optout_5724511 | Opted out of email: One to One | enumeration/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_email_quarantined | Email Address Quarantined | bool/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_email_quarantined_reason | Email address automated quarantine reason | enumeration/select | emailinformation | protected | Unmapped; read only |
| hs_email_recipient_fatigue_recovery_time | Email Address Recipient Fatigue Next Available Sending Time | datetime/date | emailinformation | protected | Unmapped; read only |
| hs_email_replied | Marketing emails replied | number/number | emailinformation | protected | Unmapped; read only |
| hs_email_sends_since_last_engagement | Sends Since Last Engagement | number/number | emailinformation | protected | Unmapped; read only |
| hs_email_type | Email type | enumeration/select | emailinformation | protected | Unmapped; read only |
| hs_emailconfirmationstatus | Marketing email confirmation status | enumeration/select | emailinformation | protected | Unmapped; read only |
| hs_employment_change_detected_date | Employment change detected date | date/date | emailinformation | restricted | Unmapped; read only |
| hs_enforce_double_opt_in | Enforce double opt in | bool/booleancheckbox | emailinformation | restricted | Unmapped; read only |
| hs_enriched_email_bounce_detected | Enriched Email Bounce Detected (Deprecated) | bool/booleancheckbox | emailinformation | protected | Unmapped; read only |
| hs_excluded_from_cross_account_data_mirroring | Excluded from cross-account data mirroring | bool/booleancheckbox | multiaccountmanagement | restricted | Unmapped; read only |
| hs_facebook_ad_clicked | Clicked Facebook ad | bool/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_facebook_click_id | Facebook Click ID | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_facebookid | Facebook ID | string/text | socialmediainformation | restricted | Unmapped; read only |
| hs_feedback_last_csat_survey_date | Last CSAT survey date | datetime/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_feedback_last_csat_survey_follow_up | Last CSAT survey comment | string/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_feedback_last_csat_survey_rating | Last CSAT survey rating | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_feedback_last_nps_follow_up | Last NPS survey comment | string/text | contactinformation | protected | Unmapped; read only |
| hs_feedback_last_nps_rating | Last NPS survey rating | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_feedback_last_nps_rating_number | Latest NPS survey rating | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_feedback_last_survey_date | Last NPS survey date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_feedback_show_nps_web_survey | Should be shown an NPS web survey | bool/booleancheckbox | contactinformation | restricted | Unmapped; read only |
| hs_first_closed_order_id | First Closed Order ID | number/number | order_information | protected | Unmapped; read only |
| hs_first_engagement_object_id | ID of first engagement | number/number | contactinformation | protected | Unmapped; read only |
| hs_first_order_closed_date | First Order Closed Date | datetime/date | order_information | protected | Unmapped; read only |
| hs_first_outreach_date | First outreach date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_first_subscription_create_date | First subscription create date | datetime/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_full_name_or_email | Full name or email | string/calculation_equation | contactinformation | protected | Unmapped; read only |
| hs_geohash_1 | geohash_1 | string/text | contactinformation | protected | Unmapped; read only |
| hs_geohash_2 | geohash_2 | string/text | contactinformation | protected | Unmapped; read only |
| hs_geohash_3 | geohash_3 | string/text | contactinformation | protected | Unmapped; read only |
| hs_geohash_4 | geohash_4 | string/text | contactinformation | protected | Unmapped; read only |
| hs_geohash_5 | geohash_5 | string/text | contactinformation | protected | Unmapped; read only |
| hs_geohash_6 | geohash_6 | string/text | contactinformation | protected | Unmapped; read only |
| hs_google_click_id | Google Click ID | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_googleplusid | googleplus ID | string/text | socialmediainformation | restricted | Unmapped; read only |
| hs_gps_error | GPS Error | string/text | contactinformation | protected | Unmapped; read only |
| hs_gps_latitude | Latitudes | string/text | contactinformation | restricted | Unmapped; read only |
| hs_gps_longitude | Longitudes | string/text | contactinformation | restricted | Unmapped; read only |
| hs_has_active_subscription | Contact has an active subscription | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_inbound_agent_inquiry_type | Last lead qualification agent conversation inquiry type | string/text | conversioninformation | protected | Unmapped; read only |
| hs_inbound_agent_last_conversation_date | Last lead qualification agent conversation date | datetime/date | conversioninformation | protected | Unmapped; read only |
| hs_inbound_agent_qualification_status | Last lead qualification agent conversation qualification status | enumeration/select | contactlcs | protected | Unmapped; read only |
| hs_inferred_language_codes | Inferred Language Codes | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_intent_paid_up_to_date | Intent paid up to date | date/date | contactinformation | protected | Unmapped; read only |
| hs_intent_signals_enabled | Intent Signals active | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_ip_timezone | IP Timezone | string/text | conversioninformation | protected | Unmapped; read only |
| hs_is_contact | Is a contact | bool/calculation_read_time | contactinformation | protected | Unmapped; read only |
| hs_is_enriched | Has been enriched | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_is_mass_marketing_activation_disallowed | Is Mass Marketing Activation Disallowed | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_is_merge_revertible | Is Merge Revertible | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_is_unworked | Contact unworked | bool/calculation_equation | contactinformation | protected | Unmapped; read only |
| hs_job_change_detected_date | Job change detected date | date/date | emailinformation | restricted | Unmapped; read only |
| hs_journey_stage | Journey Stage | enumeration/radio | contactinformation | restricted | Unmapped; read only |
| hs_language | Preferred language | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_last_metered_enrichment_timestamp | Last Metered Enrichment Timestamp | datetime/date | contactinformation | restricted | Unmapped; read only |
| hs_last_sales_activity_date | last sales activity date old | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_last_sales_activity_timestamp | Last Engagement Date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_last_sales_activity_type | Last Engagement Type | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_last_sms_send_date | Last Sms Send Date | datetime/date | smsinformation | protected | Unmapped; read only |
| hs_last_sms_send_name | Last SMS Send Name | string/text | smsinformation | protected | Unmapped; read only |
| hs_lastmodifieddate | Object last modified date/time | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_latest_disqualified_lead_date | Latest Disqualified Lead Date | datetime/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_latest_meeting_activity | Latest meeting activity | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_latest_open_lead_date | Latest Open Lead Date | datetime/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_latest_qualified_lead_date | Latest Qualified Lead Date | datetime/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_latest_sequence_ended_date | Last sequence ended date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_latest_sequence_enrolled | Last sequence enrolled | number/number | contactinformation | protected | Unmapped; read only |
| hs_latest_sequence_enrolled_date | Last sequence enrolled date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_latest_sequence_finished_date | Last sequence finished date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_latest_sequence_unenrolled_date | Last sequence unenrolled date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_latest_source | Latest Traffic Source | enumeration/select | analyticsinformation | restricted | Unmapped; read only |
| hs_latest_source_composite_data | Latest Traffic Source Composite Data | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_latest_source_data_1 | Latest Traffic Source Drill-Down 1 | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_latest_source_data_2 | Latest Traffic Source Drill-Down 2 | string/text | analyticsinformation | protected | Unmapped; read only |
| hs_latest_source_timestamp | Latest Traffic Source Date | datetime/date | analyticsinformation | restricted | Unmapped; read only |
| hs_latest_subscription_create_date | Latest subscription create date | datetime/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_latitude | Latitude | number/number | contactinformation | protected | Unmapped; read only |
| hs_lead_status | Lead Status | enumeration/radio | contactinformation | restricted | Unmapped; read only |
| hs_legal_basis | Legal basis for processing contact's data | enumeration/checkbox | contactinformation | protected | Unmapped; read only |
| hs_linkedin_ad_clicked | Clicked LinkedIn ad | enumeration/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_linkedin_click_id | LinkedIn click id | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_linkedin_url | LinkedIn URL | string/text | socialmediainformation | restricted | Unmapped; read only |
| hs_linkedinid | Linkedin ID | string/text | socialmediainformation | restricted | Unmapped; read only |
| hs_live_enrichment_deadline | Live enrichment deadline | datetime/date | contactinformation | restricted | Unmapped; read only |
| hs_longitude | Longitude | number/number | contactinformation | protected | Unmapped; read only |
| hs_manual_campaign_ids | Manual campaign ids | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_marketable_reason_id | Marketing contact status source name | string/text | contactinformation | protected | Unmapped; read only |
| hs_marketable_reason_type | Marketing contact status source type | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_marketable_status | Marketing contact status | enumeration/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_marketable_until_renewal | Marketing contact until next update | enumeration/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_membership_has_accessed_private_content | Member has accessed private content | number/calculation_equation | contactscripted | protected | Unmapped; read only |
| hs_membership_last_private_content_access_date | Membership last private content access date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_merged_object_ids | Merged Contact IDs | enumeration/checkbox | contactinformation | protected | Unmapped; read only |
| hs_messaging_engagement_score | Messaging engagement score | number/number | emailinformation | protected | Unmapped; read only |
| hs_mobile_sdk_push_tokens | Mobile Sdk Push Tokens | string/text | contactinformation | protected | Unmapped; read only |
| hs_next_renewal_date | Next Renewal Date | date/date | contactinformation | protected | Unmapped; read only |
| hs_notes_last_activity | Last Activity | object_coordinates/text | contactinformation | protected | Unmapped; read only |
| hs_notes_next_activity | Next Activity | object_coordinates/text | contactinformation | protected | Unmapped; read only |
| hs_notes_next_activity_type | Next Activity Type | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_num_active_contracts | Number of Active Contracts | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_num_associated_open_deals | Number of open deals | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_object_id | Record ID | number/number | contactinformation | protected | Unmapped; read only |
| hs_object_source | Record creation source | string/text | contactinformation | protected | Unmapped; read only |
| hs_object_source_detail_1 | Record source detail 1 | string/text | contactinformation | protected | Unmapped; read only |
| hs_object_source_detail_2 | Record source detail 2 | string/text | contactinformation | protected | Unmapped; read only |
| hs_object_source_detail_3 | Record source detail 3 | string/text | contactinformation | protected | Unmapped; read only |
| hs_object_source_id | Record creation source ID | string/text | contactinformation | protected | Unmapped; read only |
| hs_object_source_label | Record source | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_object_source_user_id | Record creation source user ID | number/number | contactinformation | protected | Unmapped; read only |
| hs_owning_teams | Owning Teams | enumeration/checkbox | contactinformation | restricted | Unmapped; read only |
| hs_persona | Persona | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_pinned_engagement_id | Pinned engagement ID | number/number | contactinformation | restricted | Unmapped; read only |
| hs_pipeline | Pipeline | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_predictivecontactscore | Predictive Lead Score | number/number | contactinformation | protected | Unmapped; read only |
| hs_predictivecontactscore_v2 | Likelihood to close | number/number | contactinformation | protected | Unmapped; read only |
| hs_predictivecontactscorebucket | Lead Rating | enumeration/radio | contactinformation | protected | Unmapped; read only |
| hs_predictivescoringtier | Contact priority | enumeration/radio | contactinformation | protected | Unmapped; read only |
| hs_prospecting_agent_activation_email_id | Prospecting Agent activation email ID | number/number | prospecting_agent_information | protected | Unmapped; read only |
| hs_prospecting_agent_activation_status | Prospecting Agent activation status | enumeration/select | prospecting_agent_information | restricted | Unmapped; read only |
| hs_prospecting_agent_actively_enrolled_count | Prospecting Agent Actively Enrolled Count | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| hs_prospecting_agent_enrollment_status | Prospecting agent enrollment status | enumeration/calculation_rollup | prospecting_agent_information | protected | Unmapped; read only |
| hs_prospecting_agent_enrollment_status_raw | Prospecting agent enrollment status (raw) | enumeration/calculation_rollup | prospecting_agent_information | protected | Unmapped; read only |
| hs_prospecting_agent_last_enrolled | Prospecting Agent Last Enrolled | datetime/calculation_rollup | contactinformation | restricted | Unmapped; read only |
| hs_prospecting_agent_sender | Prospecting agent sender | enumeration/calculation_rollup | prospecting_agent_information | protected | Unmapped; read only |
| hs_prospecting_agent_total_enrolled_count | Prospecting Agent Total Enrolled Count | number/calculation_rollup | contactinformation | restricted | Unmapped; read only |
| hs_quarantined_emails | Quarantined Emails | string/textarea | emailinformation | protected | Unmapped; read only |
| hs_read_only | Read only object | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_recent_closed_order_date | Recent Closed Order Date | datetime/date | order_information | protected | Unmapped; read only |
| hs_reddit_ad_clicked | Reddit ad clicked | bool/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_reddit_click_id | Reddit click id | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_registered_member | Registered member | number/calculation_equation | contactscripted | protected | Unmapped; read only |
| hs_registration_method | Registration Method | string/text | contactinformation | protected | Unmapped; read only |
| hs_returning_to_office_detected_date | Returning to office detected date | date/date | emailinformation | restricted | Unmapped; read only |
| hs_role | Employment Role | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_sa_first_engagement_date | Date of first engagement | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_sa_first_engagement_descr | Description of first engagement | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_sa_first_engagement_object_type | Type of first engagement | enumeration/select | contactinformation | protected | Unmapped; read only |
| hs_sales_email_last_clicked | Recent Sales Email Clicked Date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_sales_email_last_opened | Recent Sales Email Opened Date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_sales_email_last_replied | Recent Sales Email Replied Date | datetime/date | contactinformation | protected | Unmapped; read only |
| hs_searchable_calculated_international_mobile_number | Calculated Mobile Number with country code | string/phonenumber | contactinformation | protected | Unmapped; read only |
| hs_searchable_calculated_international_phone_number | Calculated Phone Number with country code | string/phonenumber | contactinformation | protected | Unmapped; read only |
| hs_searchable_calculated_mobile_number | Calculated Mobile Number without country code | phone_number/phonenumber | contactinformation | protected | Unmapped; read only |
| hs_searchable_calculated_phone_number | Calculated Phone Number without country code | phone_number/phonenumber | contactinformation | protected | Unmapped; read only |
| hs_seniority | Employment Seniority | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_sequences_actively_enrolled_count | Number of sequences actively enrolled | number/number | contactinformation | protected | Unmapped; read only |
| hs_sequences_enrolled_count | Number of sequences enrolled | number/number | contactinformation | protected | Unmapped; read only |
| hs_sequences_is_enrolled | Currently in Sequence | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_shared_team_ids | Shared teams | enumeration/checkbox | contactinformation | restricted | Unmapped; read only |
| hs_shared_user_ids | Shared users | enumeration/checkbox | contactinformation | restricted | Unmapped; read only |
| hs_sms_mobilephone_communication_subscriptions_opted_in | Mobile phone SMS subscription types: subscribed | enumeration/checkbox | smsinformation | protected | Unmapped; read only |
| hs_sms_mobilephone_communication_subscriptions_opted_out | Mobile phone SMS subscription types: unsubscribed | enumeration/checkbox | smsinformation | protected | Unmapped; read only |
| hs_sms_phone_communication_subscriptions_opted_in | Phone SMS subscription types: subscribed | enumeration/checkbox | smsinformation | protected | Unmapped; read only |
| hs_sms_phone_communication_subscriptions_opted_out | Phone SMS subscription types: unsubscribed | enumeration/checkbox | smsinformation | protected | Unmapped; read only |
| hs_social_facebook_clicks | Facebook Clicks | number/number | socialmediainformation | protected | Unmapped; read only |
| hs_social_google_plus_clicks | Google Plus Clicks | number/number | socialmediainformation | protected | Unmapped; read only |
| hs_social_last_engagement | Most Recent Social Click | datetime/date | socialmediainformation | protected | Unmapped; read only |
| hs_social_linkedin_clicks | LinkedIn Clicks | number/number | socialmediainformation | protected | Unmapped; read only |
| hs_social_num_broadcast_clicks | Broadcast Clicks | number/number | socialmediainformation | protected | Unmapped; read only |
| hs_social_twitter_clicks | Twitter Clicks | number/number | socialmediainformation | protected | Unmapped; read only |
| hs_source_object_id | Source Object ID | number/number | contactinformation | protected | Unmapped; read only |
| hs_source_portal_id | Source Portal ID | number/number | contactinformation | protected | Unmapped; read only |
| hs_sourced_contact_origin | Sourced Contact Origin | enumeration/radio | contactinformation | protected | Unmapped; read only |
| hs_state_code | State/Region Code | string/text | contactinformation | restricted | Unmapped; read only |
| hs_sub_role | Employment Sub Role | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_testrollback | testrollback | string/text | contactinformation | protected | Unmapped; read only |
| hs_tiktok_ad_clicked | TikTok ad clicked | bool/booleancheckbox | conversioninformation | restricted | Unmapped; read only |
| hs_tiktok_click_id | TikTok click id | string/text | conversioninformation | restricted | Unmapped; read only |
| hs_time_between_contact_creation_and_deal_close | Time between contact creation and deal close | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_time_between_contact_creation_and_deal_creation | Time between contact creation and deal creation | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_time_to_first_engagement | Lead response time | number/number | contactinformation | protected | Unmapped; read only |
| hs_time_to_move_from_lead_to_customer | Time to move from lead to customer | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_time_to_move_from_marketingqualifiedlead_to_customer | Time to move from marketing qualified lead to customer | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_time_to_move_from_opportunity_to_customer | Time to move from opportunity to customer | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_time_to_move_from_salesqualifiedlead_to_customer | Time to move from sales qualified lead to customer | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_time_to_move_from_subscriber_to_customer | Time to move from subscriber to customer | number/calculation_equation | contactinformation | restricted | Unmapped; read only |
| hs_timezone | Time Zone | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hs_twitterid | Twitter ID | string/text | socialmediainformation | restricted | Unmapped; read only |
| hs_unique_creation_key | Unique creation key | string/text | contactinformation | protected | Unmapped; read only |
| hs_updated_by_user_id | Updated by user ID | number/number | contactinformation | protected | Unmapped; read only |
| hs_user_ids_of_all_notification_followers | User IDs of all notification followers | enumeration/checkbox | contactinformation | protected | Unmapped; read only |
| hs_user_ids_of_all_notification_recipients | Contact record followers | enumeration/checkbox | contactinformation | protected | Unmapped; read only |
| hs_user_ids_of_all_notification_unfollowers | User IDs of all notification unfollowers | enumeration/checkbox | contactinformation | protected | Unmapped; read only |
| hs_user_ids_of_all_owners | User IDs of all owners | enumeration/checkbox | contactinformation | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_customer | Cumulative time in "Customer (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_evangelist | Cumulative time in "Evangelist (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_lead | Cumulative time in "Lead (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_marketingqualifiedlead | Cumulative time in "Marketing Qualified Lead (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_opportunity | Cumulative time in "Opportunity (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_other | Cumulative time in "Other (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_salesqualifiedlead | Cumulative time in "Sales Qualified Lead (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_cumulative_time_in_subscriber | Cumulative time in "Subscriber (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_current_stage | Date entered current stage | datetime/calculation_equation | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_customer | Date entered "Customer (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_evangelist | Date entered "Evangelist (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_lead | Date entered "Lead (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_marketingqualifiedlead | Date entered "Marketing Qualified Lead (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_opportunity | Date entered "Opportunity (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_other | Date entered "Other (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_salesqualifiedlead | Date entered "Sales Qualified Lead (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_entered_subscriber | Date entered "Subscriber (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_customer | Date exited "Customer (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_evangelist | Date exited "Evangelist (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_lead | Date exited "Lead (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_marketingqualifiedlead | Date exited "Marketing Qualified Lead (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_opportunity | Date exited "Opportunity (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_other | Date exited "Other (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_salesqualifiedlead | Date exited "Sales Qualified Lead (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_date_exited_subscriber | Date exited "Subscriber (Lifecycle Stage Pipeline)" | datetime/date | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_customer | Latest time in "Customer (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_evangelist | Latest time in "Evangelist (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_lead | Latest time in "Lead (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_marketingqualifiedlead | Latest time in "Marketing Qualified Lead (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_opportunity | Latest time in "Opportunity (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_other | Latest time in "Other (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_salesqualifiedlead | Latest time in "Sales Qualified Lead (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_latest_time_in_subscriber | Latest time in "Subscriber (Lifecycle Stage Pipeline)" | number/number | contactlcs | protected | Unmapped; read only |
| hs_v2_time_in_current_stage | Time in current stage | datetime/calculation_equation | contactlcs | protected | Unmapped; read only |
| hs_was_imported | Performed in an import | bool/booleancheckbox | contactinformation | protected | Unmapped; read only |
| hs_whatsapp_bsuids | WhatsApp BSUIDs | string/text | contactinformation | restricted | Unmapped; read only |
| hs_whatsapp_communication_subscriptions_opted_in | WhatsApp subscription types: subscribed | enumeration/checkbox | smsinformation | protected | Unmapped; read only |
| hs_whatsapp_communication_subscriptions_opted_out | WhatsApp subscription types: unsubscribed | enumeration/checkbox | smsinformation | protected | Unmapped; read only |
| hs_whatsapp_phone_number | WhatsApp Phone Number | string/phonenumber | contactinformation | restricted | Unmapped; read only |
| hs_why_this_contact | Prospecting agent recommendation reason | string/calculation_rollup | prospecting_agent_information | protected | Unmapped; read only |
| hubspot_owner_assigneddate | Owner assigned date | datetime/date | contactinformation | protected | Unmapped; read only |
| hubspot_owner_id | Contact owner | enumeration/select | contactinformation | restricted | Unmapped; read only |
| hubspot_team_id | HubSpot Team | enumeration/select | contactinformation | protected | Unmapped; read only |
| industry | Industry | string/text | contactinformation | restricted | Unmapped; read only |
| investment_interest | Investment Interest | string/text | contactinformation | reviewable | preferences.statedInterest |
| ip_address | IP Address | number/number | contactinformation | protected | Unmapped; read only |
| ip_city | IP City | string/text | conversioninformation | protected | Unmapped; read only |
| ip_country | IP Country | string/text | conversioninformation | protected | Unmapped; read only |
| ip_country_code | IP Country Code | string/text | conversioninformation | protected | Unmapped; read only |
| ip_latlon | IP latitude & longitude | string/text | conversioninformation | protected | Unmapped; read only |
| ip_state | IP State/Region | string/text | conversioninformation | protected | Unmapped; read only |
| ip_state_code | IP State Code/Region Code | string/text | conversioninformation | protected | Unmapped; read only |
| ip_zipcode | IP Zipcode | string/text | conversioninformation | protected | Unmapped; read only |
| job_function | Job function | string/text | contactinformation | restricted | Unmapped; read only |
| jobtitle | Job Title | string/text | contactinformation | reviewable | employment.title |
| kloutscoregeneral | Klout Score | number/number | socialmediainformation | restricted | Unmapped; read only |
| last_aircall_call_outcome | Last Aircall call outcome | enumeration/radio | aircall | restricted | Unmapped; read only |
| last_used_aircall_phone_number | Last used Aircall phone number | string/text | aircall | restricted | Unmapped; read only |
| last_used_aircall_tags | Last used Aircall tags | string/textarea | aircall | restricted | Unmapped; read only |
| lastmodifieddate | Last Modified Date | datetime/date | contactinformation | protected | Unmapped; read only |
| lastname | Last Name | string/text | contactinformation | reviewable | identity.lastName |
| lead_pool_tag | Lead pool tag | enumeration/select | contactinformation | restricted | Unmapped; read only |
| lead_provider | Lead provider | enumeration/select | contactinformation | restricted | Unmapped; read only |
| lifecyclestage | Lifecycle Stage | enumeration/radio | contactinformation | restricted | Unmapped; read only |
| linkedin | LinkedIn | string/text | contactinformation | reviewable | identity.linkedin |
| linkedinbio | LinkedIn Bio | string/text | socialmediainformation | restricted | Unmapped; read only |
| linkedinconnections | LinkedIn Connections | number/number | socialmediainformation | restricted | Unmapped; read only |
| marital_status | Marital Status | string/text | contactinformation | restricted | Unmapped; read only |
| message | Message | string/textarea | contactinformation | restricted | Unmapped; read only |
| military_status | Military status | string/text | contactinformation | restricted | Unmapped; read only |
| mobilephone | Mobile Phone Number | string/phonenumber | contactinformation | reviewable | identity.mobilePhone |
| notes_last_contacted | Last Contacted | datetime/date | contactinformation | protected | Unmapped; read only |
| notes_last_updated | Last Activity Date | datetime/date | contactinformation | protected | Unmapped; read only |
| notes_next_activity_date | Next Activity Date | datetime/date | contactinformation | protected | Unmapped; read only |
| num_associated_deals | Number of Associated Deals | number/calculation_rollup | contactinformation | protected | Unmapped; read only |
| num_contacted_notes | Number of times contacted | number/number | contactinformation | protected | Unmapped; read only |
| num_conversion_events | Number of Form Submissions | number/number | conversioninformation | protected | Unmapped; read only |
| num_notes | Number of Sales Activities | number/number | contactinformation | protected | Unmapped; read only |
| num_unique_conversion_events | Number of Unique Forms Submitted | number/number | conversioninformation | protected | Unmapped; read only |
| numemployees | Number of Employees | enumeration/select | contactinformation | restricted | Unmapped; read only |
| original_lead_status | Original lead status | enumeration/select | contactinformation | restricted | Unmapped; read only |
| ownername | HubSpot Owner Name (legacy) | string/text | contactinformation | restricted | Unmapped; read only |
| phone | Phone Number | string/phonenumber | contactinformation | reviewable | identity.phone |
| photo | Photo | string/text | socialmediainformation | restricted | Unmapped; read only |
| recent_conversion_date | Recent Conversion Date | datetime/date | conversioninformation | protected | Unmapped; read only |
| recent_conversion_event_name | Recent Conversion | string/text | conversioninformation | protected | Unmapped; read only |
| recent_deal_amount | Recent Deal Amount | number/number | contactinformation | protected | Unmapped; read only |
| recent_deal_close_date | Recent Deal Close Date | datetime/date | contactinformation | protected | Unmapped; read only |
| relationship_status | Relationship Status | string/text | contactinformation | restricted | Unmapped; read only |
| revenue2 | TOTAL REVENUE | enumeration/select | contactinformation | restricted | Unmapped; read only |
| salutation | Salutation | string/text | contactinformation | restricted | Unmapped; read only |
| school | School | string/text | contactinformation | restricted | Unmapped; read only |
| seniority | Seniority | string/text | contactinformation | restricted | Unmapped; read only |
| start_date | Start date | string/text | contactinformation | restricted | Unmapped; read only |
| state | State/Region | string/text | contactinformation | restricted | Unmapped; read only |
| state_province | State/Province | string/text | contactinformation | restricted | Unmapped; read only |
| surveymonkeyeventlastupdated | SurveyMonkey Event Last Updated | number/number | contactinformation | protected | Unmapped; read only |
| total_revenue | Total Revenue | number/number | contactinformation | protected | Unmapped; read only |
| twitterbio | Twitter Bio | string/text | socialmediainformation | restricted | Unmapped; read only |
| twitterhandle | Twitter Username | string/text | contactinformation | restricted | Unmapped; read only |
| twitterprofilephoto | Twitter Profile Photo | string/text | socialmediainformation | restricted | Unmapped; read only |
| webinareventlastupdated | Webinar Event Last Updated | number/number | contactinformation | protected | Unmapped; read only |
| website | Website URL | string/text | contactinformation | restricted | Unmapped; read only |
| work_email | Work email | string/text | contactinformation | protected | Unmapped; read only |
| would_you_consider_increasing_your_investment_if_the_opportunity_showed_strong_potential_returns_an | Would you consider increasing your investment if the opportunity showed strong potential returns and alinged with your goals? | string/text | lead_ads | restricted | Unmapped; read only |
| zip | Postal Code | string/text | contactinformation | restricted | Unmapped; read only |

## Changed definitions
- ctx_status: options (review raw CSV vs authoritative live options)
- hs_emailconfirmationstatus: options (review raw CSV vs authoritative live options)
- hs_lead_status: options (review raw CSV vs authoritative live options)
- hs_legal_basis: options (review raw CSV vs authoritative live options)
- hs_sa_first_engagement_descr: options (review raw CSV vs authoritative live options)
- lead_pool_tag: options (review raw CSV vs authoritative live options)
- lead_provider: options (review raw CSV vs authoritative live options)
- lifecyclestage: options (review raw CSV vs authoritative live options)
- numemployees: options (review raw CSV vs authoritative live options)
- original_lead_status: options (review raw CSV vs authoritative live options)
- revenue2: options (review raw CSV vs authoritative live options)

## Added since export
associatedcompanyid, associatedcompanylastupdated, hs_active_contracts_arr, hs_active_contracts_mrr, hs_active_contracts_tcv, hs_additional_emails, hs_all_accessible_team_ids, hs_all_assigned_business_unit_ids, hs_all_contact_vids, hs_all_owner_ids, hs_all_team_ids, hs_analytics_source_composite_data, hs_associated_target_accounts, hs_avatar_filemanager_key, hs_bing_ad_clicked, hs_calculated_form_submissions, hs_calculated_merged_vids, hs_calculated_mobile_number, hs_calculated_phone_number, hs_calculated_phone_number_area_code, hs_calculated_phone_number_country_code, hs_calculated_phone_number_region_code, hs_chatgpt_ad_clicked, hs_clicked_linkedin_ad, hs_consent_to_email_tracking, hs_conversations_visitor_email, hs_count_is_unworked, hs_count_is_worked, hs_created_by_conversations, hs_createdate, hs_cross_account_data_mirroring_source_account_ids, hs_cross_account_note, hs_cross_sell_opportunity, hs_customer_agent_lead_status, hs_data_privacy_ads_consent, hs_document_last_revisited, hs_email_communication_subscriptions_opted_in, hs_email_communication_subscriptions_opted_out, hs_email_engagement_likelihood_category, hs_email_hard_bounce_reason, hs_email_is_ineligible, hs_email_live_sourcing_restricted, hs_email_optimal_send_day_of_week, hs_email_optimal_send_time_of_day, hs_email_recipient_fatigue_recovery_time, hs_employment_change_detected_date, hs_enforce_double_opt_in, hs_excluded_from_cross_account_data_mirroring, hs_facebook_ad_clicked, hs_facebookid, hs_feedback_last_csat_survey_date, hs_feedback_last_csat_survey_follow_up, hs_feedback_last_csat_survey_rating, hs_feedback_last_nps_follow_up, hs_feedback_last_nps_rating, hs_feedback_last_nps_rating_number, hs_feedback_last_survey_date, hs_feedback_show_nps_web_survey, hs_first_outreach_date, hs_first_subscription_create_date, hs_full_name_or_email, hs_geohash_1, hs_geohash_2, hs_geohash_3, hs_geohash_4, hs_geohash_5, hs_geohash_6, hs_googleplusid, hs_gps_error, hs_gps_latitude, hs_gps_longitude, hs_has_active_subscription, hs_inbound_agent_inquiry_type, hs_inbound_agent_last_conversation_date, hs_inbound_agent_qualification_status, hs_intent_paid_up_to_date, hs_is_contact, hs_is_mass_marketing_activation_disallowed, hs_is_merge_revertible, hs_job_change_detected_date, hs_journey_stage, hs_last_metered_enrichment_timestamp, hs_last_sales_activity_date, hs_last_sales_activity_type, hs_last_sms_send_date, hs_last_sms_send_name, hs_lastmodifieddate, hs_latest_meeting_activity, hs_latest_sequence_finished_date, hs_latest_sequence_unenrolled_date, hs_latest_source_composite_data, hs_latest_subscription_create_date, hs_latitude, hs_linkedin_ad_clicked, hs_linkedinid, hs_live_enrichment_deadline, hs_longitude, hs_manual_campaign_ids, hs_marketable_reason_id, hs_marketable_reason_type, hs_marketable_status, hs_marketable_until_renewal, hs_messaging_engagement_score, hs_mobile_sdk_push_tokens, hs_notes_last_activity, hs_notes_next_activity, hs_notes_next_activity_type, hs_num_associated_open_deals, hs_object_source, hs_object_source_id, hs_object_source_user_id, hs_owning_teams, hs_pinned_engagement_id, hs_pipeline, hs_predictivecontactscore, hs_predictivecontactscore_v2, hs_predictivecontactscorebucket, hs_predictivescoringtier, hs_prospecting_agent_activation_email_id, hs_prospecting_agent_activation_status, hs_prospecting_agent_actively_enrolled_count, hs_prospecting_agent_enrollment_status_raw, hs_read_only, hs_reddit_ad_clicked, hs_reddit_click_id, hs_returning_to_office_detected_date, hs_searchable_calculated_international_mobile_number, hs_searchable_calculated_international_phone_number, hs_searchable_calculated_mobile_number, hs_searchable_calculated_phone_number, hs_sequences_actively_enrolled_count, hs_shared_team_ids, hs_shared_user_ids, hs_sms_mobilephone_communication_subscriptions_opted_in, hs_sms_mobilephone_communication_subscriptions_opted_out, hs_sms_phone_communication_subscriptions_opted_in, hs_sms_phone_communication_subscriptions_opted_out, hs_social_facebook_clicks, hs_social_google_plus_clicks, hs_social_last_engagement, hs_social_linkedin_clicks, hs_social_num_broadcast_clicks, hs_social_twitter_clicks, hs_source_object_id, hs_source_portal_id, hs_sourced_contact_origin, hs_testrollback, hs_tiktok_ad_clicked, hs_time_between_contact_creation_and_deal_close, hs_time_between_contact_creation_and_deal_creation, hs_time_to_move_from_lead_to_customer, hs_time_to_move_from_marketingqualifiedlead_to_customer, hs_time_to_move_from_opportunity_to_customer, hs_time_to_move_from_salesqualifiedlead_to_customer, hs_time_to_move_from_subscriber_to_customer, hs_twitterid, hs_unique_creation_key, hs_user_ids_of_all_notification_followers, hs_user_ids_of_all_notification_recipients, hs_user_ids_of_all_notification_unfollowers, hs_user_ids_of_all_owners, hs_was_imported, hs_whatsapp_communication_subscriptions_opted_in, hs_whatsapp_communication_subscriptions_opted_out, ip_latlon, ip_zipcode, ownername, photo, surveymonkeyeventlastupdated, webinareventlastupdated

## Proposed permissions — pending Dylan review
Keep HUBSPOT_WRITES_ENABLED=false. Read contact objects and Contact property definitions only. Do not grant create, delete, deals, company or settings operations.

Existing operational candidates: ctx_status, ctx_last_contact, ctx_booking_link_sent. Do not expand the gateway allowlist automatically. Confirm the current exact enum values and datetime format from the live registry before activating.

Potential future proposal-only fields: investment_interest, company, jobtitle, city, country, linkedin. Require source evidence, identity verification, current schema, base revision, operator approval and an explicit overwrite decision. Sensitive financial and qualification fields require separate review; self-report is never verified eligibility.

No CTX-to-HubSpot execution route was added. Existing gateway email/reply logging creates notes rather than authentic email engagements; this remains a separate release gate.
