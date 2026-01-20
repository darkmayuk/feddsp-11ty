const Image = require("@11ty/eleventy-img");
const path = require("path");
const fs = require("fs");

module.exports = function(eleventyConfig) {
  
  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addAsyncShortcode("image", async function(src, alt, sizes = "100vw", className = "") {
    
    let fullSrc = src;
    if(src.startsWith("/")) {
        fullSrc = "src" + src; 
    }

    if (!fs.existsSync(fullSrc)) {
        console.warn(`⚠️  [Missing Image] Could not find: ${fullSrc}`);
        return ""; 
    }

    let metadata = await Image(fullSrc, {
      widths: [600, 900, 1500, "auto"],
      formats: ["webp", "jpeg"],
      outputDir: "./dist/assets/img-opt/",
      urlPath: "/assets/img-opt/",
    });

    let imageAttributes = {
      alt,
      sizes,
      loading: "lazy",
      decoding: "async",
      class: className
    };

    return Image.generateHTML(metadata, imageAttributes);
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "dist"
    }
  }
};