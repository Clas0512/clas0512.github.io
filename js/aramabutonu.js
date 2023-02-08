function searchSite() {

    var searchValue = document.getElementById("searchInput").value;

    // Aranacak değere göre sayfanın yönlendirilmesi
    if (searchValue === "Adana") {
      location.href = "https://www.google.com";
    } else if (searchValue === "iletisim") {
      location.href = "https://example.com/contact";
    } else {
      alert("Aranan kelime bulunamadı.");
    }
  }