import { db } from "./server/db";

await db.user.create({
  data: {
    emailAddress: "p6N9H@example.com",
    firstName: "John",
    lastName: "Doe",
    imageUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=3&w=256&h=256&q=80",
  },
});

console.log("Created user");
