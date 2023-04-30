import pupeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import * as cheerio from "cheerio";
import slugify from "slugify";
import { getFromSSM } from "./utils";

export async function main(sucursal: string, fecha: string): Promise<void> {
  let url: string;
  console.log(`REPORTE DRIVETHRU v2 corriendo...`);

  // obtenemos las credenciales para hacer login a CV
  let username: string | undefined;
  let password: string | undefined;
  try {
    username = await getFromSSM("/pcsapi/cv/username");
    password = await getFromSSM("/pcsapi/cv/password");
  } catch (error) {
    console.error(error);
  }

  if (username && password) {
    // https://www.cloudtechsimplified.com/puppeteer-aws-lambda/
    const browser = await pupeteer.launch({
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      defaultViewport: chromium.defaultViewport,
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    });

    try {
      // vamos a la pagina de login de CV
      const page = await browser.newPage();
      url = `https://caesarmex.caesarvision.com/`;
      await page.goto(url);
      await page.waitForSelector("#user", { timeout: 10000 });

      // los "ids" (#s) son como vienen los campos en la page de login de CV
      // nos "logeamos" y esperamos el redirect
      await page.type("#user", username);
      await page.type("#password", password);
      await Promise.all([
        page.click("#log_btn"),
        page.waitForNavigation({
          timeout: 10000, // 10 seconds
        }),
      ]);

      // checamos que estemos logeados verificando el title de la pagina
      // en donde se aterriza una vez hecho login
      const title = await page.title();
      console.log(`page title = >>>${title}<<<`);
      const isLogged: boolean = title.includes("Libro de Control Principal");
      if (isLogged) {
        // nos "movemos" a la pagina de ordersearch: colosio
        url = `https://caesarmex.caesarvision.com/ordersearch.php?selectedorg=${sucursal}&&orderdate=${fecha}`;
        await page.goto(url);
        await page.waitForSelector("#submitbtn", { timeout: 30000 });

        // parseo de los datos
        const html: string = await page.content();
        const $ = cheerio.load(html);

        // procesamos la tabla sumaria
        const summary = $("#oordersearch_tbl > tbody > tr.tablesummary");
        // conteoStr
        const conteoStr = $(summary).find("td:nth-child(1)").text().trim();
        // totalUnits
        let totalUnits = parseInt(
          $(summary).find("td:nth-child(7)").text().trim()
        );
        // totalArticulos
        let totalArticulos = parseFloat(
          $(summary)
            .find("td:nth-child(10)")
            .text()
            .replace("$", "")
            .replace(",", "")
            .trim()
        );
        // subTotal
        let subTotal = parseFloat(
          $(summary)
            .find("td:nth-child(11)")
            .text()
            .replace("$", "")
            .replace(",", "")
            .trim()
        );
        // Total
        let total = parseFloat(
          $(summary)
            .find("td:nth-child(12)")
            .text()
            .replace("$", "")
            .replace(",", "")
            .trim()
        );

        totalUnits = isNaN(totalUnits) ? 0 : totalUnits;
        totalArticulos = isNaN(totalArticulos) ? 0 : totalArticulos;
        subTotal = isNaN(subTotal) ? 0 : subTotal;
        total = isNaN(total) ? 0 : total;

        console.log(`conteoStr = ${conteoStr}`);
        console.log(`totalUnits = ${totalUnits}`);
        console.log(`totalArticulos = ${totalArticulos}`);
        console.log(`subTotal = ${subTotal}`);
        console.log(`total = ${total}`);

        //
        //
        // escribir los datos en la BD
      } else {
        // XXX hay que levantar una excepcion
        console.error("No se pudo hacer login a CV");
      }
    } catch (error) {
      console.error(error);
    }
  }
}

// (async () => {
//   await main("S19", "2023-04-23");
// })();
