-- FÖRNAMN OCH EFTERNAMN I VARSITT FÄLT (issue #16).
--
-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT;

-- DE BEFINTLIGA NAMNEN DELAS, OCH "name" LÄMNAS ORÖRD.
--
-- Delningen sker vid SISTA mellanslaget: "Anna Maria Svensson" blir
-- "Anna Maria" och "Svensson". Ett namn utan mellanslag blir ett förnamn utan
-- efternamn, vilket är precis det fall de två fälten finns för att synliggöra
-- — personen får rätta det själv under Ditt konto.
--
-- Att backa: kolumnerna är nya och "name" har sitt gamla värde kvar, så en
-- föregående version av appen fungerar oförändrad mot den här databasen. Det
-- som behövs för att backa är alltså ingenting.
UPDATE "admin_users"
SET
  "first_name" = NULLIF(
    btrim(
      substring(
        btrim("name")
        from 1
        for length(btrim("name")) - position(' ' in reverse(btrim("name")))
      )
    ),
    ''
  ),
  -- position() svarar 0 när mellanslag saknas, och right(x, -1) klipper då
  -- bort första tecknet i stället för att ge tomt. Därför ett eget fall.
  "last_name" = CASE
    WHEN position(' ' in btrim("name")) = 0 THEN NULL
    ELSE NULLIF(
      btrim(right(btrim("name"), position(' ' in reverse(btrim("name"))) - 1)),
      ''
    )
  END
WHERE "name" IS NOT NULL AND btrim("name") <> '';
