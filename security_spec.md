# Security Specifications & Rules Validation (TDD)

## 1. Data Invariants
- **Products Catalog Isolation**: Any non-authenticated/non-admin writes (creates, deletes, or modifying administrative fields like price/stock) must be blocked. Customers are ONLY allowed to append reviews.
- **Strict Verification**: Only a verified administrator logged in with the credential `salahbousbia82@gmail.com` can perform catalog updates and edit settings.
- **Secure Fulfillments / Orders**: General users can only fetch single order entries that they own (using the exact Order ID) but cannot perform list operations to scrape all client data. Only the admin can list all order information.

## 2. "The Dirty Dozen" Hostile Payloads
We define twelve high-severity payloads attempting to compromise store data integrity, verifying that security rules will correctly return `PERMISSION_DENIED`:

1. **Hostile Payload 1: Unauthorized Product Deletion**
   - *Attack*: Attempting to issue a `delete` command on a product document without admin authorization.
2. **Hostile Payload 2: Price Alteration / Privilege Escalation**
   - *Attack*: Modifying a product's price from `500` to `1` during checkout or viewing.
3. **Hostile Payload 3: Direct Settings Modification**
   - *Attack*: Overwriting store settings documents to redirect customer phone/email contacts to malicious numbers.
4. **Hostile Payload 4: Arbitrary Order List Scraping**
   - *Attack*: Querying/Listing the entire `/orders` collection as an anonymous user.
5. **Hostile Payload 5: Unauthorized Order Status Manipulation**
   - *Attack*: Changing an order's status from `pending` to `delivered` from the storefront.
6. **Hostile Payload 6: Malicious Review Injection**
   - *Attack*: Injecting a review object that modifies the standard product properties (like resetting its title/stock/price) instead of just the reviews array.
7. **Hostile Payload 7: Junk Character Product ID Injection**
   - *Attack*: Trying to create a product using a 10KB string as the productId to cause database wallet leakage.
8. **Hostile Payload 8: Negative Pricing in Order**
   - *Attack*: Submitting an order document with a total of `-500` to force payment anomalies.
9. **Hostile Payload 9: Empty Item Checkout**
   - *Attack*: Submitting an order with zero product items.
10. **Hostile Payload 10: Fake Admin Email Spoofing**
    - *Attack*: Logging in with an unverified email address resembling the admin to access backend panel writes.
11. **Hostile Payload 11: Oversized Review Payload**
    - *Attack*: Appending a mammoth string (1MB) as a rating comment to overflow document memory storage.
12. **Hostile Payload 12: Order Overwrite**
    - *Attack*: Attempting to edit/update or delete another customer's placed order document after creation.

## 3. Security Tests Specifications Verification
The security rules will evaluate permissions in the following order: (1) Authentication validation, (2) Schema matches, and (3) Relational checks. All tested hostile actions listed above will properly result in rejection with `PERMISSION_DENIED`.
