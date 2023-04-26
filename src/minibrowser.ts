import pupeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import * as cheerio from "cheerio";
import slugify from "slugify";
import { getFromSSM } from "./utils";

async function main(): Promise<void> {
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
  console.log(`username: ${username}`);

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
      console.log(`URL: ${url}`);
      await page.goto(url);
      await page.waitForSelector("#user", { timeout: 10000 });
      console.log("depues de page.goto(url)");

      // los "ids" (#s) son como vienen los campos en la page de login de CV
      // nos "logeamos" y esperamos el redirect
      await page.type("#user", username);
      await page.type("#password", password);
      console.log("depues de page.type(#user, username)");
      await Promise.all([
        page.click("#log_btn"),
        page.waitForNavigation({
          timeout: 10000, // 10 seconds
        }),
      ]);
      console.log(`PAGE URL = ${page.url()}`);

      // checamos que estemos logeados verificando el title de la pagina
      // en donde se aterriza una vez hecho login
      const title = await page.title();
      console.log(`page title = >>>${title}<<<`);
      const isLogged: boolean = title.includes("Libro de Control Principal");
      if (isLogged) {
        console.log("Estamos logeados...");
        // nos "movemos" a la pagina de ordersearch: colosio
        url = `https://caesarmex.caesarvision.com/ordersearch.php?selectedorg=O1054&&orderdate=2023-04-23`;
        console.log(`Antes de ir a ordersearch URL: ${url}`);
        await page.goto(url);
        await page.waitForSelector("#submitbtn", { timeout: 30000 });
        console.log("depues de ir a ordersearch");

        // parseo de los datos
        const html: string = await page.content();
        const $ = cheerio.load(html);
        console.log(`From Cheerio: ${$("title").text()}`);

        const rows = $("table#oordersearch_tbl>tbody>tr[class*='tablerow']");
        console.log(`rows.length = ${rows.length}`);
        const ordenes = [];
        for (const row of rows) {
          let tipoPago = slugify($(row).find("td:nth-child(13)").text().trim());
          // la fecha no viene en formato ISO, la transformamos
          let fstr = $(row).find("td:nth-child(3)").text().trim();
          const fecha: string = new Date(Date.parse(fstr))
            .toISOString()
            .split("T")[0];
          // tipo de pago viene muy danado desde CV incluso con slugificado
          tipoPago = tipoPago.includes("DAfA(c)bito") ? "Debito" : tipoPago;
          ordenes.push({
            orden: $(row).find("td:nth-child(1)").text().trim() || "_",
            fecha: fecha || "_",
            hora: $(row).find("td:nth-child(5)").text().trim() || "_",
            tipo: $(row).find("td:nth-child(6)").text().trim() || "_",
            units: parseInt($(row).find("td:nth-child(7)").text().trim()) || -1,
            empleado: $(row).find("td:nth-child(8)").text().trim() || "_",
            cliente: $(row).find("td:nth-child(9)").text().trim() || "_",
            totalArticulos:
              parseFloat(
                $(row).find("td:nth-child(10)").text().replace("$", "").trim()
              ) || -1,
            subTotal:
              parseFloat(
                $(row).find("td:nth-child(11)").text().replace("$", "").trim()
              ) || -1,
            total:
              parseFloat(
                $(row).find("td:nth-child(12)").text().replace("$", "").trim()
              ) || -1,
            tipoPago: tipoPago || "_",
          });
        }
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
        let Total = parseFloat(
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
        Total = isNaN(Total) ? 0 : Total;

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

(async () => {
  await main();
})();
