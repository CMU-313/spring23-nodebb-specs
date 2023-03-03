## Feature 1:

Tackled User Story 1. This feature involved adding a resolved status on topics so users can understand whether or not a question has been answered.

**How to Use and How to User Test**

To initially test, you should first create a new topic as a logged in user. When a topic is first created, the topic should, by default, be set as `resolved: false`, and this will display on the topic page in the form of a checkbox labeled “Resolved?” with the text being green if the box is checked and the issue is resolved, or red if the box is unchecked and the issue is unresolved. The checkbox should be unchecked at this stage.

If you’re logged in, manually check and uncheck the box to update the topic according to the resolved status of the topic. This should be persistent, so if you check it and log in as another user, the box should stay checked.

Once someone replies, hopefully as a response to the question, the `resolved` status is set as true, so on refreshing the page after replying the box should be checked.

If you’re logged on, you’ll be unable to see the checkbox and instead have text that will reflect the status of the topic, either resolved or unresolved.

**Tests**
The automated tests for this feature are found in the file `test/topics.js`

This tests the following:

- Upon creation of the topic, the topic is marked as `resolved: false`
- Upon posting a reply, the topic is updated to `resolved: true`
- When setResolved (a function for the socket to interact with) is called, the `resolved` status is set to the opposite of what it was. (This handles the checkbox feature.)
- That setResolved raises an error on invalid data
- That the socket API changes the `resolved` status.

This gamut of tests sufficiently covers the changes that were made for this feature, as it runs through every non-frontend additional functionality that was added, as well as covers the case where functions may receive invalid input from the user. The only lines that weren’t shown as covered in the coverage tool involved handling non-redis databases, which were covered in the GitHub Actions in running it with postgres and mongo.




## Feature 2:

Tackled User Story 1. This feature involved displaying the student/instructor tag on every post, depending on what the user specified during registration.

**How to Use and How to User Test**

To test, create a user and select any of the available account types (currently supports ‘student’ or ‘instructor’). Next, make a post as this user and confirm that the correct account type is displayed next to the author name of the post. It should specifically be formatted as
`<authorname> | <accounttype>`. Finally, delete the user account. Return to the page with your previous post and confirm that there now exists no `accounttype` after the author name. Specifically, it should look like `A Former User | `.

**Tests**

The automated tests for this feature are found in the file `test/user.js`

This tests the following:

- `accounttype` should have trailing/preceding spaces removed (to make sure the `accounttype` is validated in format)
- `accounttype` should default to student, if not specified
- `accounttype` should store correct field, if specified
- The database does not store the `accounttype` once account is deleted

These tests sufficiently cover the non-frontend additions to the codebase, since we couldn’t actually test the frontend additions. They also cover additions for multiple types of input, such as the case where `accounttype` is specified during creation and the case where `accounttype` is not specified during creation. 
