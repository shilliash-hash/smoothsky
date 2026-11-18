# SmoothSky – Faza 1: Autoryzacja i fundamenty ekonomiczne

## Co zbudujemy
1. **Logowanie / rejestracja** – email + hasło oraz Google. Wylogowanie, reset hasła (strona /reset-password).
2. **Onboarding (obowiązkowy)** – po pierwszym zalogowaniu kreator: nazwa linii, unikalny 3-literowy kod ICAO firmy (A–Z, sprawdzany na żywo), wybór lotniska bazy z wyszukiwarką. Dopóki firma nie istnieje, dashboard przekierowuje do kreatora.
3. **Kapitał startowy** – przy utworzeniu firmy automatycznie wpis INITIAL_GRANT +50 000 Cr w księdze.
4. **Katalog ~180 lotnisk** – reprezentatywne porty z całego świata (ICAO, nazwa, miasto, kraj, lat, lon), z mocnym pokryciem Europy/Polski.
5. **Rynek leasingu T1–T3** (wartości wstępne, do balansu):

| Tier | Samolot | Pax / Cargo | Kaucja | Rata tyg. |
|---|---|---|---|---|
| T1 | Cessna 172 Skyhawk | 3 / 0 kg | 5 000 Cr | 1 500 Cr |
| T2 | Beechcraft Baron 58 | 5 / 150 kg | 12 000 Cr | 3 800 Cr |
| T3 | Beechcraft King Air 350 | 9 / 400 kg | 35 000 Cr | 9 500 Cr |

   Leasing pobiera kaucję + pierwszą ratę (zgodnie ze specyfikacją: kapitał ma pokryć start, ale bez dużej nadwyżki). Limit 3 leasingów. Samolot trafia do floty w bazie domowej.
6. **Dashboard** – saldo, flota, status bazy domowej (lotnisko, współrzędne), historia transakcji z saldem po operacji, przejście do rynku leasingu.

## Design „Flight Deck”
Ciemny motyw: głęboki slate/navy, akcenty cyan (runway) i amber (instrument). Typografia: techniczna (np. Space Grotesk + JetBrains Mono dla liczb/kodów ICAO), panele w stylu wyświetlaczy awioniki.

## Szczegóły techniczne
- Lovable Cloud; tabele: `airports` (publiczny odczyt), `aircraft_types` (publiczny odczyt), `companies` (1:1 z user, unikalny `icao_code`), `company_ledger` (append-only: amount, balance_after, entry_type, reference, created_at), `fleet_aircraft` (lease: deposit, weekly_rate, next_payment_due, location ICAO).
- RLS: gracz widzi tylko swoją firmę, flotę i księgę. Brak INSERT/UPDATE/DELETE na księdze i saldzie z poziomu klienta – saldo liczone wyłącznie z ledgera.
- Operacje pieniężne przez funkcje SQL `SECURITY DEFINER` (`create_company`, `lease_aircraft`) – atomowe, z blokadą firmy, kontrolą salda i wpisami INITIAL_GRANT / LEASE_DEPOSIT / LEASE_PAYMENT. Podwójny zapis: każdy wpis ma konto przeciwne (np. SYSTEM_TREASURY / LESSOR) i `idempotency_key`.
- Trasy: publiczne `/`, `/auth`, `/reset-password`; chronione `_authenticated/` – `/onboarding`, `/dashboard`, `/market`.
- Testy reguł: kapitał 50 000, odrzucenie leasingu przy braku środków, format kodu ICAO.
